# Orbit Escape 1.3.0 для Android

Обновление предназначено для существующего приложения **com.orbitescape.game**. У него код версии 4. У APK версии 1.1.0, скачанного из RuStore 19 ноября 2026 года, код 2. Сборка поддерживает установку с Android 7.0 (API 24) и целевой Android 16 (API 36). Для запуска нужен работающий системный WebView. Игровые файлы поставляются внутри APK. Свободный полёт запрашивает эфемериды, когда есть соединение. Без сети позиции обновляются по встроенным данным и орбитальной модели.

## Подписать готовый APK на Windows

Понадобятся хранилище ключей, которым подписан опубликованный APK, его псевдоним (alias) и пароли. В Android Studio открой **SDK Manager → SDK Tools** и установи **Android SDK Build-Tools 36**. Скопируй готовый файл `Orbit-Escape-1.3.0-unsigned.apk` и скрипт `Sign-Orbit-Escape.ps1` в одну папку. Открой в этой папке PowerShell. Подставь путь к своему ключу и его действительное имя.

```powershell
.\Sign-Orbit-Escape.ps1 -Keystore "D:\AndroidKeys\orbit-release.jks" -Alias "orbit"
```

Пароли вводятся в запросах Android Build Tools на твоём компьютере. Скрипт проверяет сертификат результата и выдаёт `Orbit-Escape-1.3.0-release.apk` при совпадении со старой версией. Если команда блокируется политикой запуска скриптов, можно подписать APK через установленный `apksigner.bat` с аргументами `sign --ks ПУТЬ --ks-key-alias ИМЯ --out signed.apk Orbit-Escape-1.3.0-unsigned.apk` и затем выполнить `apksigner.bat verify --verbose --print-certs signed.apk`. Публичный отпечаток SHA-256 сертификата 1.1.0 приведён ниже.

```text
e667e50cc622082aed87a11ed0bc344287d730c8f231f87e44d23486a5e467b4
```

Проверь обновление поверх установленной из RuStore 1.1.0 на телефоне, где есть прогресс, и открой «Солнечный курьер». Для установки через ADB используется `adb install -r Orbit-Escape-1.3.0-release.apk`.

## Собрать из исходников

Используй Node.js 22.12+ и JDK 21. В SDK Manager установи Android SDK Platform 36 и Android SDK Build-Tools 36. Путь к SDK задаётся через `ANDROID_HOME` или `android/local.properties`. Из корня проекта выполни:

```powershell
npm.cmd ci
npm.cmd run cap:sync
cd android
.\gradlew.bat :app:assembleRelease :app:bundleRelease
```

APK находится в `android/app/build/outputs/apk/release/`, AAB — в `android/app/build/outputs/bundle/release/`. По умолчанию оба файла выпускаются без подписи. Для подписи во время сборки Gradle принимает четыре переменные окружения текущего процесса — `ORBIT_STORE_FILE` (абсолютный путь), `ORBIT_STORE_PASSWORD`, `ORBIT_KEY_ALIAS`, `ORBIT_KEY_PASSWORD`. Пароли можно передать из локального менеджера секретов или CI. Gradle сверяет сертификат в указанном хранилище с отпечатком 1.1.0.

`:app:assemblePreview` собирает тестовое приложение **com.orbitescape.game.preview** со своей подписью и отдельными сохранениями. Для обновления в карточке игры RuStore выбери подписанный APK основного приложения. Для AAB используются настройки подписи AAB в RuStore Консоли. [Инструкции RuStore по подписи](https://www.rustore.ru/help/developers/publishing-and-verifying-apps/app-publication/apk-signature)
