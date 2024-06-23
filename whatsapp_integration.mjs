import puppeteer from 'puppeteer';
import { Client } from 'whatsapp-web.js';
import { config as dotenvConfig } from 'dotenv';
import qrcode from 'qrcode-terminal';
import { chatWithDocs } from './rag_code.mjs'; // Ensure the path is correct

dotenvConfig();

const client = new Client({
  puppeteer: {
    executablePath: puppeteer.executablePath(), // Use the path to the installed Chromium
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  },
  webVersionCache: {
    type: "remote",
    remotePath: "https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html",
  },
});

client.on('qr', (qr) => {
  qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
  console.log('Client is ready!');
});

client.on('message', async (msg) => {
  console.log(`Message received from ${msg.from}: ${msg.body}`);
  const chat = await msg.getChat();
  try {
    console.log('Processing the message...');

    // Send typing indicator
    await chat.sendStateTyping();

    const result = await chatWithDocs(msg.body);
    console.log('Result:', result);

    const replyContent = result; // Extract the content from the result object
    console.log(`Sending reply: ${replyContent}`);

    // Stop typing indicator
    await chat.clearState();

    await msg.reply(replyContent);
    console.log('Reply sent.');
  } catch (error) {
    console.error('Error processing the message:', error);

    // Stop typing indicator in case of an error
    await chat.clearState();

    await msg.reply('Sorry, an error occurred while processing your request.');
  }
});

client.initialize();
