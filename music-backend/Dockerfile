# Reelhouse Music backend — Render/Kotlin runtime
FROM eclipse-temurin:17-jdk-jammy AS build
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY . .
RUN chmod +x gradlew && ./gradlew installDist --no-daemon

# Pinned sidecar used by BgutilTokenProvider. The checksum makes the runtime
# token generator reproducible; the binary is not part of the application jar.
RUN curl -fsSL -o /tmp/bgutil-pot \
        https://github.com/jim60105/bgutil-ytdlp-pot-provider-rs/releases/download/v0.8.1/bgutil-pot-linux-x86_64 \
    && echo "e7c264a574fa2705b6e5dc62283a8a4e80130f27b9d7e9df44e6b09aa6151a87  /tmp/bgutil-pot" | sha256sum -c - \
    && chmod 0755 /tmp/bgutil-pot

FROM eclipse-temurin:17-jre-jammy
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 10001 --create-home reelhouse
COPY --from=build --chown=reelhouse:reelhouse /app/build/install/reelhouse-music-backend /app
COPY --from=build --chown=reelhouse:reelhouse /tmp/bgutil-pot /app/bgutil-pot
COPY --chown=reelhouse:reelhouse docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod 0755 /app/docker-entrypoint.sh /app/bgutil-pot
USER reelhouse
ENV PORT=8080
ENV JAVA_OPTS="-Xms64m -Xmx256m -XX:+UseSerialGC -XX:MaxMetaspaceSize=96m"
EXPOSE 8080
ENTRYPOINT ["/app/docker-entrypoint.sh"]
