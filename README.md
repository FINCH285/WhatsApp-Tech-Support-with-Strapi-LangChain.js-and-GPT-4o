# WhatsApp-Tech-Support-with-Strapi-LangChain.js-and-GPT-4o

## Project Overview
This project integrates WhatsApp with Strapi, LangChain.js, and GPT-4o to provide a tech support solution. It allows users to interact with a chatbot that can answer technical support questions by retrieving information from documents stored in Strapi.

## Features
- Integration with WhatsApp for seamless communication.
- Utilizes LangChain.js for document processing and retrieval.
- Employs GPT-4o for generating responses to user queries.
- Caches documents to improve performance and reduce redundant downloads.
- Supports both PDF and text documents.

## Dependencies
- @langchain/community: ^0.2.12
- @langchain/core: ^0.2.8
- @langchain/openai: ^0.1.3
- axios: ^1.7.2
- dotenv: ^16.4.5
- langchain: ^0.2.5
- pdf-parse: ^1.1.1
- puppeteer: ^22.12.0
- qrcode-terminal: ^0.12.0
- whatsapp-web.js: github:pedroslopez/whatsapp-web.js

navigate into your working directory and run the following commands to run the App. Don't forget to also add your openAI API key in the .env file.

```bash
npm install
```
```bash
node .\whatsapp_integration.mjs
```
![WhatsAppVideo2024-06-23at22 28 02_a7ca094d-ezgif com-video-to-gif-converter](https://github.com/FINCH285/WhatsApp-Tech-Support-with-Strapi-LangChain.js-and-GPT-4o/assets/78143716/16267d95-26dc-4888-a54b-7109605497bf)
