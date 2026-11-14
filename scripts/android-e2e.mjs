#!/usr/bin/env node
/**
 * android-e2e.mjs — Verify the Android bundle on a booted emulator/device.
 *
 * Checks, in order:
 *   1. The APK installs and `nova://chat/<id>` opens MainActivity (intent data
 *      survives in the activity record).
 *   2. CAMERA, RECORD_AUDIO and MODIFY_AUDIO_SETTINGS are declared and can be granted.
 *   3. The running WebView can actually acquire camera and microphone streams
 *      (this exercises Tauri's on_permission_request handler, not just the
 *      manifest).
 *   4. The app process survives the deep link and the media probe without a
 *      FATAL EXCEPTION, native crash or ANR in logcat.
 *
 * Usage:
 *   ANDROID_APK=path/to/app-debug.apk node scripts/android-e2e.mjs
 *
 * Environment:
 *   ADB                    adb binary (default: adb)
 *   ANDROID_APK            APK to install (required unless SKIP_INSTALL=1)
 *   ANDROID_PACKAGE        application id (default: com.messanger.e2e.debug)
 *   ANDROID_DEEP_LINK      link to open (default: nova://chat/ci-smoke-test)
 *   SKIP_INSTALL           set to 1 to reuse an installed app
 */

import { execFileSync } from 'node:child_process';

const ADB = process.env.ADB || 'adb';
const PACKAGE = process.env.ANDROID_PACKAGE || 'com.messanger.e2e.debug';
const DEEP_LINK = process.env.ANDROID_DEEP_LINK || 'nova://chat/ci-smoke-test';
const APK = process.env.ANDROID_APK;
const SKIP_INSTALL = process.env.SKIP_INSTALL === '1';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function adb(args, options = {}) {
  return execFileSync(ADB, args, {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  });
}

function adbQuiet(args) {
  try {
    return adb(args);
  } catch {
    return '';
  }
}

function log(message) {
  console.log(`[android-e2e] ${message}`);
}

function fail(message) {
  throw new Error(message);
}

const PACKAGE_PATTERN = PACKAGE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const CRASH_HEADER = /FATAL EXCEPTION|ANR in |Fatal signal \d+/;
const CRASH_PROCESS = new RegExp(
  `(?:Process: |Cmdline: |ANR in )${PACKAGE_PATTERN}(?::[^\\s,]+)?(?:\\s|,|$)`,
);

/** Collect crash blocks from the logcat buffer that belong to our package. */
function fatalCrashes() {
  const lines = adbQuiet(['logcat', '-d']).split(/\r?\n/);
  const crashes = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (!CRASH_HEADER.test(lines[i])) continue;
    const window = lines.slice(i, i + 40).join('\n');
    if (
      CRASH_PROCESS.test(window) ||
      window.includes(`>>> ${PACKAGE} <<<`) ||
      window.includes(`Cmdline: ${PACKAGE}`)
    ) {
      crashes.push(lines.slice(i, i + 12).join('\n'));
      i += 39;
    }
  }
  return crashes;
}

function assertNoCrashes(stage) {
  const crashes = fatalCrashes();
  if (crashes.length > 0) {
    fail(`${PACKAGE} crashed during ${stage}:\n${crashes.slice(0, 3).join('\n---\n')}`);
  }
  log(`no FATAL EXCEPTION, native crash or ANR for ${PACKAGE} during ${stage}`);
}

function assertProcessAlive(expectedPid, stage) {
  const pid = adbQuiet(['shell', 'pidof', PACKAGE]).trim().split(/\s+/)[0];
  if (!pid) fail(`${PACKAGE} is not running after ${stage}`);
  if (expectedPid && pid !== expectedPid) {
    fail(`${PACKAGE} restarted during ${stage} (pid ${expectedPid} -> ${pid})`);
  }
  return pid;
}

async function waitFor(check, description, timeoutMs, intervalMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    try {
      const value = await check();
      if (value) return value;
      last = value;
    } catch (error) {
      last = error.message;
    }
    await sleep(intervalMs);
  }
  fail(`timed out waiting for ${description}${last ? ` (last: ${last})` : ''}`);
}

function cdpEvaluate(wsUrl, expression, timeoutMs = 45000) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl);
    const timer = setTimeout(() => {
      try {
        socket.close();
      } catch {}
      reject(new Error('CDP evaluate timed out'));
    }, timeoutMs);

    socket.onopen = () => {
      socket.send(
        JSON.stringify({
          id: 1,
          method: 'Runtime.evaluate',
          params: { expression, awaitPromise: true, returnByValue: true },
        }),
      );
    };

    socket.onmessage = (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id !== 1) return;
      clearTimeout(timer);
      try {
        socket.close();
      } catch {}
      if (message.error) {
        reject(new Error(`CDP error: ${JSON.stringify(message.error)}`));
        return;
      }
      if (message.result?.exceptionDetails) {
        reject(
          new Error(
            `CDP exception: ${
              message.result.exceptionDetails.exception?.description ??
              message.result.exceptionDetails.text
            }`,
          ),
        );
        return;
      }
      resolve(message.result?.result?.value);
    };

    socket.onerror = () => {
      clearTimeout(timer);
      reject(new Error('CDP websocket error'));
    };
  });
}

async function main() {
  log(`waiting for adb device (${ADB})`);
  adb(['wait-for-device']);
  await waitFor(
    () => adbQuiet(['shell', 'getprop', 'sys.boot_completed']).trim() === '1',
    'sys.boot_completed=1',
    180000,
  );
  await waitFor(
    () =>
      adbQuiet(['shell', 'service', 'check', 'package']).includes('found') &&
      adbQuiet(['shell', 'pm', 'list', 'packages', 'android']).includes('package:android'),
    'package manager',
    120000,
  );

  if (SKIP_INSTALL) {
    log('skipping install (SKIP_INSTALL=1)');
  } else {
    if (!APK) fail('ANDROID_APK is required unless SKIP_INSTALL=1');
    log(`installing ${APK}`);
    await waitFor(
      () => {
        try {
          adb(['install', '-r', APK]);
          return true;
        } catch (error) {
          log(`install attempt failed, retrying: ${error.stderr?.toString().trim() || error.message}`);
          return false;
        }
      },
      'APK install',
      120000,
      5000,
    );
  }

  const installed = adbQuiet(['shell', 'pm', 'path', PACKAGE]).trim();
  if (!installed) fail(`${PACKAGE} is not installed`);

  const manifest = adb(['shell', 'dumpsys', 'package', PACKAGE]);
  // MODIFY_AUDIO_SETTINGS is an install-time permission the generated
  // WebChromeClient needs for audio capture; only CAMERA and RECORD_AUDIO are
  // runtime permissions and can be granted from the shell.
  for (const permission of [
    'android.permission.CAMERA',
    'android.permission.RECORD_AUDIO',
    'android.permission.MODIFY_AUDIO_SETTINGS',
  ]) {
    if (!manifest.includes(permission)) {
      fail(`${PACKAGE} does not declare ${permission}`);
    }
  }
  log('manifest declares CAMERA, RECORD_AUDIO and MODIFY_AUDIO_SETTINGS');

  // Grant before the WebView is created: Chromium caches the app's capture
  // permissions when the renderer starts, so granting after `am start` leaves
  // getUserMedia reporting NotAllowedError even though dumpsys shows granted.
  for (const permission of ['android.permission.CAMERA', 'android.permission.RECORD_AUDIO']) {
    adb(['shell', 'pm', 'grant', PACKAGE, permission]);
  }
  const granted = adb(['shell', 'dumpsys', 'package', PACKAGE]);
  for (const permission of ['android.permission.CAMERA', 'android.permission.RECORD_AUDIO']) {
    if (!granted.includes(`${permission}: granted=true`)) {
      fail(`runtime grant failed for ${permission}`);
    }
  }
  log('camera and microphone runtime permissions granted');

  adb(['logcat', '-c']);
  adb(['shell', 'am', 'force-stop', PACKAGE]);

  log(`opening ${DEEP_LINK}`);
  const startOutput = adb([
    'shell',
    'am',
    'start',
    '-W',
    '-a',
    'android.intent.action.VIEW',
    '-d',
    DEEP_LINK,
  ]);
  if (!/Status: ok/i.test(startOutput)) {
    fail(`am start did not report success:\n${startOutput}`);
  }
  if (!startOutput.includes(PACKAGE)) {
    log(`warning: am start output did not name ${PACKAGE}:\n${startOutput}`);
  }

  await waitFor(
    () => {
      const dump = adbQuiet(['shell', 'dumpsys', 'activity', 'activities']);
      const resumed = dump
        .split(/\r?\n/)
        .find((line) => line.includes('topResumedActivity') || line.includes('mResumedActivity'));
      return resumed?.includes(PACKAGE) && dump.includes(DEEP_LINK) ? dump : '';
    },
    `${PACKAGE} resumed with the deep link ${DEEP_LINK}`,
    45000,
  );
  log(`deep link opened ${PACKAGE} and the activity kept ${DEEP_LINK}`);

  const pid = await waitFor(
    () => adbQuiet(['shell', 'pidof', PACKAGE]).trim().split(/\s+/)[0],
    `${PACKAGE} process`,
    30000,
  );
  await sleep(3000);
  assertNoCrashes('deep link startup');
  assertProcessAlive(pid, 'deep link startup');

  const devtoolsPort = 9222;
  adbQuiet(['forward', '--remove', `tcp:${devtoolsPort}`]);
  log(`forwarding webview devtools socket for pid ${pid}`);
  adb(['forward', `tcp:${devtoolsPort}`, `localabstract:webview_devtools_remote_${pid}`]);

  try {
    // The first target a fresh WebView exposes is often the blank document it
    // is about to navigate away from; attaching to it fails with
    // "Inspected target navigated or closed". Wait for the real document.
    const findTarget = async () => {
      const response = await fetch(`http://127.0.0.1:${devtoolsPort}/json`);
      if (!response.ok) return null;
      const pages = await response.json();
      return (
        pages.find(
          (page) =>
            page.type === 'page' &&
            page.webSocketDebuggerUrl &&
            typeof page.url === 'string' &&
            page.url !== '' &&
            !page.url.startsWith('about:'),
        ) ?? null
      );
    };

    const targets = await waitFor(
      async () => (await findTarget()) ?? '',
      'WebView devtools target',
      45000,
    );

    log(`attached to ${targets.url}`);

    const probe = `(async () => {
        const results = {};
        const probes = [
          ['camera', { video: true }],
          ['microphone', { audio: true }],
        ];
        for (const [name, constraints] of probes) {
          // The emulator's capture devices can still be initialising right
          // after boot, so tolerate one transient failure before giving up.
          for (let attempt = 1; attempt <= 2; attempt += 1) {
            try {
              const stream = await navigator.mediaDevices.getUserMedia(constraints);
              stream.getTracks().forEach((track) => track.stop());
              results[name] = 'granted';
              break;
            } catch (error) {
              results[name] = 'error:' + (error && error.name) + ':' + (error && error.message);
              if (attempt === 1) await new Promise((r) => setTimeout(r, 2000));
            }
          }
        }
        results.devices = (await navigator.mediaDevices.enumerateDevices()).map(
          (device) => device.kind + ':' + device.label,
        );
        return JSON.stringify(results);
      })()`;

    // A page that reloads mid-probe kills the session; re-attach to the target
    // that exists now instead of failing the whole run.
    let result;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const target = attempt === 1 ? targets : await waitFor(findTarget, 'WebView devtools target', 20000);
      try {
        result = await cdpEvaluate(target.webSocketDebuggerUrl, probe);
        break;
      } catch (error) {
        if (attempt === 3) throw error;
        log(`retrying the media probe after: ${error.message}`);
        await sleep(2000);
      }
    }

    const media = JSON.parse(result);
    log(`getUserMedia: ${JSON.stringify(media)}`);
    if (media.camera !== 'granted') fail(`camera getUserMedia failed: ${media.camera}`);
    if (media.microphone !== 'granted') fail(`microphone getUserMedia failed: ${media.microphone}`);
    log('camera and microphone streams acquired inside the WebView');

    assertNoCrashes('camera/microphone probe');
    assertProcessAlive(pid, 'camera/microphone probe');
  } finally {
    adbQuiet(['forward', '--remove', `tcp:${devtoolsPort}`]);
  }

  log('all Android end-to-end checks passed');
}

main().catch((error) => {
  console.error(`[android-e2e] FAILED: ${error.message}`);
  try {
    const crash = adbQuiet(['logcat', '-d', '-t', '200']);
    const lines = crash
      .split(/\r?\n/)
      .filter((line) => /FATAL EXCEPTION|AndroidRuntime|chromium|PermissionRequest/i.test(line));
    if (lines.length) console.error(lines.slice(-40).join('\n'));
  } catch {}
  process.exitCode = 1;
});
