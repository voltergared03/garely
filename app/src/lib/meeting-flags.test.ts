import { describe, it, expect } from 'vitest';
import { flagsFromMeeting, flagsToBody, DEFAULT_MEETING_FLAGS } from './meeting-flags';

describe('meeting flags', () => {
  it('falls back to the defaults when a field is missing or null', () => {
    expect(flagsFromMeeting(undefined)).toEqual(DEFAULT_MEETING_FLAGS);
    expect(flagsFromMeeting({ transcriptionEnabled: null, allowGuests: undefined })).toEqual(DEFAULT_MEETING_FLAGS);
  });

  it('keeps an explicit false — a switched-off meeting must not come back on in the editor', () => {
    expect(flagsFromMeeting({ transcriptionEnabled: false, aiReportEnabled: false, taskCreationEnabled: true, allowGuests: false }))
      .toEqual({ transcription: false, aiReport: false, taskCreation: true, allowGuests: false });
  });

  it('maps back to the API column names one-to-one', () => {
    const f = { transcription: false, aiReport: true, taskCreation: true, allowGuests: false };
    expect(flagsToBody(f)).toEqual({ transcriptionEnabled: false, aiReportEnabled: true, taskCreationEnabled: true, allowGuests: false });
    expect(flagsFromMeeting(flagsToBody(f))).toEqual(f);
  });
});
