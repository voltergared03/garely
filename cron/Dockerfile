# EZmeet scheduler sidecar: runs the periodic jobs (reminders, weekly digest,
# recording retention, registration-request cleanup) against the app's internal
# API on the compose network. Replaces the old host-crontab step.
#
# busybox ships crond + wget + sh, so no package installs or downloads are
# needed and the image is multi-arch (amd64/arm64) out of the box.
FROM busybox:1.36

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
