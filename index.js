#! /usr/bin/env node
import ora from 'ora';
import fetch from 'node-fetch';
import chalk from 'chalk';
import readline from 'readline';
import ShellJS from 'shelljs';

const args = process.argv.slice(2);
const query = args.join(' ');

async function autocomplete(prompt) {
  if (!process.env.OPENAI_TOKEN) {
    throw new Error('No API token provided');
  }

  const response = await fetch('https://api.openai.com/v1/engines/davinci-codex/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENAI_TOKEN}`,
    },
    body: JSON.stringify({
      prompt,
      temperature: 0,
      max_tokens: 300,
      top_p: 1,
      frequency_penalty: 0,
      presence_penalty: 0,
      stop: ['#']
    }),
  });
  
  const json = await response.json();

  if (!json || !json.choices || !json.choices.length) {
    throw new Error('No suggestion found');
  }

  const suggestion = json.choices[0].text.trim().replace(/^!/, '');
  if (!suggestion) {
    throw new Error('No suggestion found');
  }

  return suggestion;
}

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
    const suggestion = await autocomplete(prompt);

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
