#! /usr/bin/env node
import fs from 'fs';
import os from 'os';
import ora from 'ora';
import path from 'path';
import request from 'request-promise';
import chalk from 'chalk';
import readline from 'readline';
import ShellJS from 'shelljs';

const PATH_TO_API_KEY_FILE = path.join(os.homedir(), '.x');

const args = process.argv.slice(2);
const query = args.join(' ');

function getApiKey() {
  if (!!process.env.OPENAI_TOKEN) {
    return process.env.OPENAI_TOKEN;
  }

  if (fs.existsSync(PATH_TO_API_KEY_FILE)) {
    return fs.readFileSync(PATH_TO_API_KEY_FILE, 'utf8');
  }

  return undefined;
}

async function fetchAndStoreApiKey() {
  const spinner = ora('Initializing...').start();
  const apiKey = await request('https://fant.io/x');
  fs.writeFileSync(PATH_TO_API_KEY_FILE, apiKey, 'utf8');
  spinner.succeed('Initialized');
}

async function getSuggestion(prompt) {
  const response = await request({
    url: 'https://api.openai.com/v1/engines/davinci-codex/completions',
    method: 'POST',
    json: true,
    headers: {
      'Authorization': `Bearer ${getApiKey()}`,
    },
    body: {
      prompt,
      temperature: 0,
      max_tokens: 300,
      top_p: 1,
      frequency_penalty: 0,
      presence_penalty: 0,
      stop: ['#']
    },
  });

  if (!response || !response.choices || !response.choices.length) {
    throw new Error('No suggestion found');
  }

  const suggestion = response.choices[0].text.trim().replace(/^!/, '');
  if (!suggestion) {
    throw new Error('No suggestion found');
  }

  return suggestion;
}

async function suggest() {
  readline.emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.on('keypress', (_chunk, key) => {
    if (key.ctrl && key.name === 'c') {
      process.exit();
    }
  });

  let prompt = `# Bash\n# ${query}\n`;
  let attempt = 0;
  const spinner = ora(query).start();
  try {
    while (true) {
      const suggestion = await getSuggestion(prompt);

      spinner.color = 'green';
      spinner.text = `${chalk.bold(suggestion)}\n\nenter → run command\nspace → new suggestion`;
      spinner.spinner = { frames: ['$'] };

      const shouldExecuteCommand = await new Promise((resolve) => {
        function listener(_chunk, key) {
          switch (key.name) {
            case 'return':
              process.stdin.removeListener('keypress', listener);
              resolve(true);
              break;
            case 'space':
              process.stdin.removeListener('keypress', listener);
              resolve(false);
              break;
          }
        }

        process.stdin.on('keypress', listener);
      });

      if (shouldExecuteCommand) {
        spinner.stop();
        console.log(chalk.green('$ ') + chalk.bold(suggestion));

        ShellJS.exec(suggestion, {async: true});
      } else {
        attempt++;
        if (attempt === 3) break;
        spinner.color = 'cyan';
        spinner.text = query;
        spinner.spinner = 'dots';
        prompt += `${suggestion}\n\n# Same command, but differently formatted\n`;
      }
    }

    throw new Error('No suggestion found');
  } catch (error) {
    spinner.fail(error.toString());
  }
}

if (!query) {
  console.log('Use like:');
  console.log(chalk.green('$ ') + chalk.bold('x list s3 buckets'));
} else if (query === 'init') {
  await fetchAndStoreApiKey();
} else {
  if (!getApiKey()) await fetchAndStoreApiKey();
  await suggest();
}
