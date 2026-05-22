"""
EAM Meet — LiveKit Agent with Deepgram STT + DeepSeek Post-Meeting Analysis

This agent:
1. Joins LiveKit rooms automatically via webhook
2. Subscribes to all audio tracks
3. Runs Deepgram Nova-3 multilingual STT (RU/UK/EN code-switching)
4. Publishes live transcription to room via data channel
5. Stores transcript segments via the Next.js API
6. On room end, sends full transcript to DeepSeek for summary/tasks/decisions
7. Fetches API keys from DB via settings API (hot-reload without restart)
"""

import asyncio
import json
import logging
import os
from datetime import datetime

import httpx
from dotenv import load_dotenv
from livekit import rtc
from livekit.agents import (
    AutoSubscribe,
    JobContext,
    JobProcess,
    WorkerOptions,
    cli,
    stt as stt_module,
)
from livekit.plugins.deepgram import STT

load_dotenv()

logger = logging.getLogger("eam-meet-agent")
logger.setLevel(logging.INFO)

# Config
APP_URL = os.getenv("APP_URL", "http://localhost:3000")
# Shared secret for the app's internal endpoints (webhooks + key sync).
INTERNAL_KEY = os.getenv("INTERNAL_API_SECRET") or os.getenv("NEXTAUTH_SECRET") or os.getenv("AUTH_SECRET") or ""

# Initial keys from env (will be overridden by DB values)
_cached_keys: dict[str, str] = {
    "DEEPSEEK_API_KEY": os.getenv("DEEPSEEK_API_KEY", ""),
    "DEEPSEEK_BASE_URL": os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com"),
    "DEEPGRAM_API_KEY": os.getenv("DEEPGRAM_API_KEY", ""),
}
_keys_last_fetched: float = 0


async def fetch_api_keys() -> dict[str, str]:
    """Fetch latest API keys from the app's settings API."""
    global _cached_keys, _keys_last_fetched
    import time

    # Cache for 60 seconds to avoid hammering the API
    now = time.time()
    if now - _keys_last_fetched < 60 and all(_cached_keys.values()):
        return _cached_keys

    try:
        async with httpx.AsyncClient() as client:
            res = await client.get(f"{APP_URL}/api/settings/keys", headers={"x-internal-key": INTERNAL_KEY}, timeout=10)
            if res.status_code == 200:
                data = res.json()
                for key_name, key_data in data.items():
                    if isinstance(key_data, dict) and key_data.get("value"):
                        _cached_keys[key_name] = key_data["value"]
                _keys_last_fetched = now
                logger.info("API keys refreshed from DB")
            else:
                logger.warning(f"Failed to fetch keys: {res.status_code}")
    except Exception as e:
        logger.warning(f"Could not fetch API keys from DB, using cached/env: {e}")

    return _cached_keys


def prewarm(proc: JobProcess):
    """Pre-warm: initialize Deepgram STT plugin."""
    dgram_key = os.getenv("DEEPGRAM_API_KEY", "")
    proc.userdata["stt"] = STT(
        api_key=dgram_key,
        language=os.getenv("DEEPGRAM_LANGUAGE", "multi"),
        model=os.getenv("DEEPGRAM_MODEL", "nova-3"),
        smart_format=True,
        no_delay=True,
        endpointing_ms=500,
        interim_results=True,
        punctuate=True,
    )


async def create_stt_with_latest_key() -> STT | None:
    """Create a new STT instance with the latest Deepgram key from DB."""
    keys = await fetch_api_keys()
    dgram_key = keys.get("DEEPGRAM_API_KEY", "")
    if not dgram_key:
        return None
    return STT(
        api_key=dgram_key,
        language=keys.get("DEEPGRAM_LANGUAGE", "multi"),
        model=keys.get("DEEPGRAM_MODEL", "nova-3"),
        smart_format=True,
        no_delay=True,
        endpointing_ms=500,
        interim_results=True,
        punctuate=True,
    )


async def entrypoint(ctx: JobContext):
    """Main agent entrypoint — runs per room."""
    logger.info(f"Agent joining room: {ctx.room.name}")

    room_name = ctx.room.name
    meeting_id = await get_meeting_id(room_name)
    if not meeting_id:
        logger.warning(f"Could not find meeting for room {room_name}")
        return

    await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)

    # Try to get latest Deepgram key, fall back to prewarm STT
    fresh_stt = await create_stt_with_latest_key()
    stt: STT = fresh_stt if fresh_stt else ctx.proc.userdata["stt"]

    transcript_segments: list[dict] = []
    segment_counter = 0
    last_ai_notes_count = 0  # Track when we last sent AI notes

    async def maybe_send_live_ai_notes():
        """Periodically generate and broadcast live AI notes every ~20 segments."""
        nonlocal last_ai_notes_count
        current_count = len(transcript_segments)
        # Only trigger if we have enough new segments (at least 20 since last update)
        if current_count < 10 or current_count - last_ai_notes_count < 20:
            return
        last_ai_notes_count = current_count
        try:
            keys = await fetch_api_keys()
            deepseek_key = keys.get("DEEPSEEK_API_KEY", "")
            deepseek_base = keys.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com")
            if not deepseek_key:
                return

            recent = transcript_segments[-60:]  # Last ~60 segments for context
            text = "\n".join(
                f"[{s.get('language', '??').upper()}] {s['speakerName']}: {s['content']}"
                for s in recent
            )

            async with httpx.AsyncClient() as client:
                res = await client.post(
                    f"{deepseek_base}/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {deepseek_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": keys.get("DEEPSEEK_MODEL", "deepseek-chat"),
                        "messages": [
                            {"role": "system", "content": "You are a live meeting analyst. Respond with valid JSON only. Be concise."},
                            {"role": "user", "content": f"Analyze this partial meeting transcript. Respond in Ukrainian.\n\n{text}\n\nJSON format:\n{{\"summary\": \"1-2 речення про що зараз йде мова\", \"decisions\": [\"рішення\"], \"action_items\": [\"завдання\"]}}"},
                        ],
                        "response_format": {"type": "json_object"},
                        "temperature": 0.3,
                        "max_tokens": 800,
                    },
                    timeout=30,
                )
                if res.status_code == 200:
                    data = res.json()
                    content = data["choices"][0]["message"]["content"]
                    notes = json.loads(content)
                    await ctx.room.local_participant.publish_data(
                        json.dumps({
                            "type": "ai-notes",
                            "summary": notes.get("summary", ""),
                            "decisions": notes.get("decisions", []),
                            "action_items": notes.get("action_items", []),
                        }),
                        topic="ai-notes",
                    )
                    logger.info("Live AI notes broadcast")
        except Exception as e:
            logger.warning(f"Failed to generate live AI notes: {e}")

    async def detect_action_item(text: str, speaker: str):
        """Check if a transcript segment contains an action item and broadcast it."""
        action_keywords = [
            "треба", "потрібно", "зроби", "зробити", "зробимо",
            "давай", "до п'ятниці", "до завтра", "до кінця тижня",
            "need to", "should", "will do", "let's do", "make sure",
            "must", "deadline", "action item", "таск", "задача",
            "відповідальний", "візьми на себе", "доручаю",
        ]
        lower_text = text.lower()
        if not any(kw in lower_text for kw in action_keywords):
            return
        if len(text) < 15:
            return

        try:
            keys = await fetch_api_keys()
            deepseek_key = keys.get("DEEPSEEK_API_KEY", "")
            deepseek_base = keys.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com")
            if not deepseek_key:
                return

            async with httpx.AsyncClient() as client:
                res = await client.post(
                    f"{deepseek_base}/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {deepseek_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": keys.get("DEEPSEEK_MODEL", "deepseek-chat"),
                        "messages": [
                            {"role": "system", "content": "You detect action items from meeting speech. Return JSON. If the text does NOT contain an action item, return {\"is_action\": false}. If it does, return {\"is_action\": true, \"title\": \"concise task in Ukrainian\", \"assignee\": \"name or null\"}."},
                            {"role": "user", "content": f"Speaker: {speaker}\nText: {text}"},
                        ],
                        "response_format": {"type": "json_object"},
                        "temperature": 0.2,
                        "max_tokens": 200,
                    },
                    timeout=15,
                )
                if res.status_code == 200:
                    data = res.json()
                    result = json.loads(data["choices"][0]["message"]["content"])
                    if result.get("is_action"):
                        await ctx.room.local_participant.publish_data(
                            json.dumps({
                                "type": "action-detected",
                                "title": result.get("title", text[:80]),
                                "assignee": result.get("assignee"),
                            }),
                            topic="action-items",
                        )
                        logger.info(f"Action item detected: {result.get('title')}")
        except Exception as e:
            logger.warning(f"Action item detection failed: {e}")

    async def process_participant(participant: rtc.RemoteParticipant):
        nonlocal segment_counter

        logger.info(f"Processing audio for: {participant.identity} ({participant.name})")

        audio_stream = rtc.AudioStream.from_participant(
            participant=participant,
            track_source=rtc.TrackSource.SOURCE_MICROPHONE,
        )

        stt_stream = stt.stream()

        async def feed_audio():
            try:
                async for event in audio_stream:
                    if isinstance(event, rtc.AudioFrameEvent):
                        stt_stream.push_frame(event.frame)
            except Exception as e:
                logger.error(f"Audio stream error for {participant.identity}: {e}")

        async def process_results():
            nonlocal segment_counter
            try:
                async for event in stt_stream:
                    ev_type = event.type

                    if ev_type == stt_module.SpeechEventType.INTERIM_TRANSCRIPT:
                        if event.alternatives:
                            alt = event.alternatives[0]
                            interim_text = alt.text.strip()
                            if interim_text:
                                lang = str(getattr(alt, "language", "uk") or "uk")
                                try:
                                    await ctx.room.local_participant.publish_data(
                                        json.dumps({
                                            "type": "transcription",
                                            "speaker": participant.name or participant.identity,
                                            "text": interim_text,
                                            "language": lang,
                                            "isFinal": False,
                                        }),
                                        topic="transcription",
                                    )
                                except Exception:
                                    pass

                    elif ev_type == stt_module.SpeechEventType.FINAL_TRANSCRIPT:
                        if not event.alternatives:
                            continue
                        alt = event.alternatives[0]
                        text = alt.text.strip()
                        if not text:
                            continue

                        language = str(getattr(alt, "language", "uk") or "uk")
                        start_time = getattr(alt, "start_time", segment_counter * 5.0)
                        end_time = getattr(alt, "end_time", segment_counter * 5.0 + 4.0)
                        confidence = getattr(alt, "confidence", 0.95)

                        segment = {
                            "speakerName": participant.name or participant.identity,
                            "speakerId": participant.identity if not participant.identity.startswith("guest-") else None,
                            "content": text,
                            "language": language,
                            "startTime": start_time,
                            "endTime": end_time,
                            "confidence": confidence,
                        }

                        transcript_segments.append(segment)
                        segment_counter += 1

                        logger.info(f"[{language.upper()}] {participant.name}: {text}")

                        try:
                            await ctx.room.local_participant.publish_data(
                                json.dumps({
                                    "type": "transcription",
                                    "speaker": participant.name or participant.identity,
                                    "text": text,
                                    "language": language,
                                    "timestamp": start_time,
                                    "isFinal": True,
                                }),
                                topic="transcription",
                            )
                        except Exception as pub_err:
                            logger.warning(f"Failed to publish transcription: {pub_err}")

                        await store_segment(meeting_id, segment)

                        # Trigger live AI features (non-blocking)
                        asyncio.create_task(maybe_send_live_ai_notes())
                        asyncio.create_task(detect_action_item(text, participant.name or participant.identity))

            except Exception as e:
                logger.error(f"STT stream error for {participant.identity}: {e}")
                import traceback
                logger.error(traceback.format_exc())

        feed_task = asyncio.create_task(feed_audio())
        process_task = asyncio.create_task(process_results())

        try:
            await asyncio.gather(feed_task, process_task)
        except Exception as e:
            logger.error(f"Error processing {participant.identity}: {e}")
        finally:
            await stt_stream.aclose()

    participant_tasks: dict[str, asyncio.Task] = {}

    @ctx.room.on("participant_connected")
    def on_participant_connected(participant: rtc.RemoteParticipant):
        if participant.identity not in participant_tasks:
            task = asyncio.create_task(process_participant(participant))
            participant_tasks[participant.identity] = task

    @ctx.room.on("participant_disconnected")
    def on_participant_disconnected(participant: rtc.RemoteParticipant):
        task = participant_tasks.pop(participant.identity, None)
        if task:
            task.cancel()

    for participant in ctx.room.remote_participants.values():
        if participant.identity not in participant_tasks:
            task = asyncio.create_task(process_participant(participant))
            participant_tasks[participant.identity] = task

    disconnect_event = asyncio.Event()

    @ctx.room.on("disconnected")
    def on_disconnected():
        disconnect_event.set()

    await disconnect_event.wait()

    logger.info(f"Room ended. Total segments: {len(transcript_segments)}")

    for task in participant_tasks.values():
        task.cancel()

    if transcript_segments:
        await generate_report(meeting_id, transcript_segments)


async def get_meeting_id(room_name: str) -> str | None:
    """Look up meeting ID by LiveKit room name."""
    try:
        async with httpx.AsyncClient() as client:
            res = await client.get(
                f"{APP_URL}/api/meetings",
                params={"livekitRoom": room_name},
                headers={"x-internal-key": INTERNAL_KEY},
                timeout=10,
            )
            if res.status_code == 200:
                meetings = res.json()
                if meetings and len(meetings) > 0:
                    return meetings[0]["id"]
    except Exception as e:
        logger.error(f"Failed to get meeting ID: {e}")
    return None


async def store_segment(meeting_id: str, segment: dict):
    """Store a transcript segment via the app API, retrying transient failures."""
    payload = {"meetingId": meeting_id, **segment}
    headers = {"x-internal-key": INTERNAL_KEY}
    for attempt in range(3):
        try:
            async with httpx.AsyncClient() as client:
                res = await client.post(
                    f"{APP_URL}/api/webhooks/transcript",
                    json=payload,
                    headers=headers,
                    timeout=10,
                )
            if res.status_code < 500:
                return  # 2xx ok, or a 4xx that retrying won't fix
            logger.warning(f"store_segment HTTP {res.status_code} (attempt {attempt + 1})")
        except Exception as e:
            logger.error(f"Failed to store segment (attempt {attempt + 1}): {e}")
        await asyncio.sleep(1.5 * (attempt + 1))
    logger.error("store_segment: giving up after 3 attempts")


async def generate_report(meeting_id: str, segments: list[dict]):
    """Send transcript to DeepSeek for summarization and task extraction.
    Fetches latest API keys from DB before making the request."""
    logger.info(f"Generating AI report for meeting {meeting_id}...")

    # Fetch latest keys from DB
    keys = await fetch_api_keys()
    deepseek_key = keys.get("DEEPSEEK_API_KEY", "")
    deepseek_base = keys.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com")

    if not deepseek_key:
        logger.error("No DeepSeek API key available, skipping report generation")
        return

    transcript_text = "\n".join(
        f"[{s.get('language', '??').upper()}] {s['speakerName']}: {s['content']}"
        for s in segments
    )

    prompt = f"""Analyze this meeting transcript and provide a structured JSON response.
The meeting was conducted in multiple languages (Ukrainian, English, Russian).
Respond in Ukrainian.

TRANSCRIPT:
{transcript_text}

Provide a JSON response with this exact structure:
{{
  "summary": "2-3 paragraph TL;DR of the meeting in Ukrainian",
  "agenda": ["topic 1", "topic 2", ...],
  "decisions": ["decision 1", "decision 2", ...],
  "action_items": [
    {{
      "title": "task description",
      "assignee_name": "person name from transcript or null",
      "priority": "high|medium|low",
      "due_description": "timeframe mentioned or null"
    }}
  ],
  "follow_ups": ["follow-up item 1", "follow-up item 2", ...],
  "language_stats": {{
    "ua_percent": 58,
    "en_percent": 30,
    "ru_percent": 12
  }},
  "speaker_stats": [
    {{"name": "speaker name", "word_count": 500, "percent": 42}}
  ]
}}"""

    try:
        async with httpx.AsyncClient() as client:
            res = await client.post(
                f"{deepseek_base}/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {deepseek_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": keys.get("DEEPSEEK_MODEL", "deepseek-chat"),
                    "messages": [
                        {"role": "system", "content": "You are a meeting analysis assistant. Always respond with valid JSON."},
                        {"role": "user", "content": prompt},
                    ],
                    "response_format": {"type": "json_object"},
                    "temperature": 0.3,
                    "max_tokens": 4096,
                },
                timeout=60,
            )

            if res.status_code != 200:
                logger.error(f"DeepSeek API error: {res.status_code} {res.text}")
                return

            data = res.json()
            content = data["choices"][0]["message"]["content"]
            report = json.loads(content)

            logger.info("AI report generated successfully")

            await client.post(
                f"{APP_URL}/api/webhooks/report",
                headers={"x-internal-key": INTERNAL_KEY},
                json={
                    "meetingId": meeting_id,
                    "summary": report.get("summary", ""),
                    "agenda": report.get("agenda", []),
                    "decisions": report.get("decisions", []),
                    "followUps": report.get("follow_ups", []),
                    "actionItems": report.get("action_items", []),
                    "languageStats": report.get("language_stats", {}),
                    "speakerStats": report.get("speaker_stats", []),
                    "modelUsed": keys.get("DEEPSEEK_MODEL", "deepseek-chat"),
                    "tokensInput": data.get("usage", {}).get("prompt_tokens", 0),
                    "tokensOutput": data.get("usage", {}).get("completion_tokens", 0),
                    "rawPrompt": prompt,
                    "rawResponse": content,
                },
                timeout=30,
            )

            logger.info("Report stored successfully")

    except Exception as e:
        logger.error(f"Failed to generate report: {e}")


if __name__ == "__main__":
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            prewarm_fnc=prewarm,
            api_key=os.getenv("LIVEKIT_API_KEY", ""),
            api_secret=os.getenv("LIVEKIT_API_SECRET", ""),
            ws_url=os.getenv("LIVEKIT_URL", "ws://localhost:7880"),
        )
    )
