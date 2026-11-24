# Reelhouse Music backend — Render/Kotlin runtime
FROM eclipse-temurin:17-jdk-jammy AS build
WORKDIR /app
COPY . .
RUN chmod +x gradlew && ./gradlew installDist --no-daemon

FROM eclipse-temurin:17-jre-jammy
WORKDIR /app
RUN useradd --system --uid 10001 --create-home reelhouse
COPY --from=build --chown=reelhouse:reelhouse /app/build/install/reelhouse-music-backend /app
USER reelhouse
ENV PORT=8080
ENV JAVA_OPTS="-Xms64m -Xmx320m -XX:+UseSerialGC -XX:MaxMetaspaceSize=112m"
EXPOSE 8080
CMD ["sh", "-c", "exec /app/bin/reelhouse-music-backend $JAVA_OPTS"]
