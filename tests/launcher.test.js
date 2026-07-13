import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const root = new URL('../', import.meta.url);

function readProjectFile(path) {
  return readFileSync(new URL(path, root), 'utf8').replace(/\r\n/g, '\n');
}

describe('Windows launcher', () => {
  it('keeps Start.bat as the only user-facing batch entry', () => {
    expect(existsSync(new URL('Start.bat', root))).toBe(true);
    expect(existsSync(new URL('一键启动.bat', root))).toBe(false);
    expect(existsSync(new URL('start-api-pressure-lab.bat', root))).toBe(false);
    expect(existsSync(new URL('launcher-template.bat', root))).toBe(false);
  });

  it('starts and checks the server before opening the browser', () => {
    const launcher = readProjectFile('Start.bat');

    const startServer = launcher.indexOf('start "" /b node scripts\\start-detached-server.cjs');
    const waitForHealth = launcher.indexOf('[5/5] Waiting for WebUI');
    const openBrowser = launcher.indexOf('start "" "%APP_URL%"');

    expect(startServer).toBeGreaterThan(-1);
    expect(waitForHealth).toBeGreaterThan(startServer);
    expect(openBrowser).toBeGreaterThan(waitForHealth);
  });

  it('can stop the server even when Get-NetTCPConnection is unavailable', () => {
    const launcher = readProjectFile('Start.bat');
    const stopServer = readProjectFile('scripts/stop-server.ps1');

    expect(launcher).toContain('scripts\\stop-server.ps1');
    expect(stopServer).toMatch(/Get-NetTCPConnection/);
    expect(stopServer).toMatch(/Get-Command\s+Get-NetTCPConnection/);
    expect(stopServer).toMatch(/netstat\s+-ano/i);
  });

  it('validates the command line before stopping a process found on the port', () => {
    const stopServer = readProjectFile('scripts/stop-server.ps1');

    expect(stopServer).toMatch(/\$safeTargets/);
    expect(stopServer).toMatch(/CommandLine/);
    expect(stopServer).toMatch(/server\\index\.js/);
    expect(stopServer.indexOf('$safeTargets')).toBeLessThan(stopServer.indexOf('Stop-Process -Id $id'));
  });

  it('validates the project pid command line before stopping it', () => {
    const stopServer = readProjectFile('scripts/stop-server.ps1');

    expect(stopServer).toMatch(/\$trustedTargets/);
    expect(stopServer).not.toMatch(/ProcessName -eq 'node'/);
    expect(stopServer).toMatch(/Get-CimInstance Win32_Process/);
    expect(stopServer).toMatch(/Test-ProjectServerProcess \$process/);
  });

  it('matches only the absolute server entry path and cannot kill another project', () => {
    const stopServer = readProjectFile('scripts/stop-server.ps1');

    expect(stopServer).toContain("('*' + $server + '*')");
    expect(stopServer).not.toContain("-like '*server\\index.js*'");
    expect(stopServer).not.toContain("-like '*server/index.js*'");
  });

  it('keeps the server attached to the launcher console without showing an extra window', () => {
    const detachedServer = readProjectFile('scripts/start-detached-server.cjs');

    expect(detachedServer).toContain('detached: false');
    expect(detachedServer).not.toContain('child.unref()');
    expect(detachedServer).toContain('windowsHide: true');
  });
});
