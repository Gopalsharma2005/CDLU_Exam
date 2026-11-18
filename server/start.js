const { spawn } = require('node:child_process');
const http = require('node:http');
const path = require('node:path');

const port = process.env.PORT || 5000;
const url = `http://localhost:${port}`;
const server = spawn(process.execPath, [path.join(__dirname, 'index.js')], {
  stdio: 'inherit'
});

let attempts = 0;
const readyCheck = setInterval(() => {
  attempts += 1;
  const request = http.get(`${url}/api/health`, (response) => {
    response.resume();
    if (response.statusCode === 200) {
      clearInterval(readyCheck);
      openBrowser();
    }
  });

  request.on('error', () => {
    if (attempts >= 60) {
      clearInterval(readyCheck);
      console.error(`Portal did not become ready. Open ${url} manually when the server is running.`);
    }
  });
}, 500);

function openBrowser() {
  let command;
  let args;

  if (process.platform === 'win32') {
    command = 'cmd.exe';
    args = ['/c', 'start', '', url];
  } else if (process.platform === 'darwin') {
    command = 'open';
    args = [url];
  } else {
    command = 'xdg-open';
    args = [url];
  }

  const browser = spawn(command, args, { detached: true, stdio: 'ignore' });
  browser.once('error', (error) => {
    console.error(`Could not open a browser automatically: ${error.message}`);
    console.error(`Open ${url} manually.`);
  });
  browser.unref();
}

server.once('error', (error) => {
  clearInterval(readyCheck);
  console.error(`Could not start the examination server: ${error.message}`);
  process.exitCode = 1;
});

server.once('exit', (code) => {
  clearInterval(readyCheck);
  process.exitCode = code ?? 0;
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.kill(signal));
}
