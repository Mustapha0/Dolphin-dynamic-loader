FROM ubuntu:24.04
ENV DEBIAN_FRONTEND=noninteractive ANDROID_SDK_ROOT=/opt/android-sdk ANDROID_HOME=/opt/android-sdk GRADLE_USER_HOME=/home/dolphin/.gradle
RUN apt-get update && apt-get install -y --no-install-recommends openjdk-17-jdk-headless curl unzip zip ca-certificates git gnupg && rm -rf /var/lib/apt/lists/*
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get update && apt-get install -y --no-install-recommends nodejs && rm -rf /var/lib/apt/lists/*
RUN mkdir -p ${ANDROID_SDK_ROOT}/cmdline-tools && curl -fsSL https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip -o /tmp/cmdline-tools.zip && unzip -q /tmp/cmdline-tools.zip -d ${ANDROID_SDK_ROOT}/cmdline-tools && mv ${ANDROID_SDK_ROOT}/cmdline-tools/cmdline-tools ${ANDROID_SDK_ROOT}/cmdline-tools/latest && rm /tmp/cmdline-tools.zip
RUN curl -fsSL https://services.gradle.org/distributions/gradle-8.9-bin.zip -o /tmp/gradle.zip && unzip -q /tmp/gradle.zip -d /opt && rm /tmp/gradle.zip
ENV PATH=/opt/gradle-8.9/bin:${ANDROID_SDK_ROOT}/cmdline-tools/latest/bin:${ANDROID_SDK_ROOT}/platform-tools:${PATH}
RUN yes | sdkmanager --licenses >/dev/null && sdkmanager "platform-tools" "platforms;android-35" "build-tools;35.0.0" "build-tools;34.0.0"
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY . .
RUN useradd --create-home --uid 10001 dolphin && mkdir -p /app/jobs /home/dolphin/.gradle && chown -R dolphin:dolphin /app /home/dolphin ${ANDROID_SDK_ROOT}
USER dolphin
EXPOSE 8080
CMD ["node","server.js"]
