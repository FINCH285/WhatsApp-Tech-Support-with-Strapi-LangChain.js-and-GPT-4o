import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { TextLoader } from 'langchain/document_loaders/fs/text';
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { OpenAIEmbeddings } from '@langchain/openai';
import { MemoryVectorStore } from 'langchain/vectorstores/memory';
import dotenv from 'dotenv';
import { RunnableSequence } from '@langchain/core/runnables';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { ChatOpenAI } from '@langchain/openai';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { RunnablePassthrough } from '@langchain/core/runnables';

dotenv.config();

const cacheFolderPath = './cache';

// Function to clear the cache folder
function clearCacheFolder() {
  if (fs.existsSync(cacheFolderPath)) {
    fs.readdirSync(cacheFolderPath).forEach((file) => {
      const filePath = path.join(cacheFolderPath, file);
      fs.unlinkSync(filePath);
    });
  } else {
    fs.mkdirSync(cacheFolderPath);
  }
}

// Ensure cache is cleared every time the app starts
clearCacheFolder();

// Function to download Docs from Strapi with caching
async function downloadDocsWithCache(url) {
  const filename = path.basename(url);
  const cacheFilePath = path.join(cacheFolderPath, filename);

  // Check if the file already exists in the cache
  if (fs.existsSync(cacheFilePath)) {
    console.log(`Using cached file: ${cacheFilePath}`);
    return cacheFilePath;
  }

  console.log(`Downloading file: ${url}`);
  const fullUrl = url.startsWith('/') ? `http://localhost:30080${url}` : url;
  try {
    const response = await axios({
      url: fullUrl,
      method: 'GET',
      responseType: 'stream',
    });

    const writer = fs.createWriteStream(cacheFilePath);
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', () => {
        console.log(`File downloaded and cached: ${cacheFilePath}`);
        resolve(cacheFilePath);
      });
      writer.on('error', (err) => {
        console.error(`Error writing file: ${err}`);
        reject(err);
      });
    });
  } catch (error) {
    console.error(`Error downloading file from ${fullUrl}:`, error);
    throw error;
  }
}

// Function to fetch document URLs from Strapi
async function fetchDocumentUrlsFromStrapi() {
  const strapiEndpoint = 'http://localhost:30080/api/tech-support-knowledgebases?populate=documents';
  try {
    const response = await axios.get(strapiEndpoint);
    const documentUrls = response.data.data.flatMap(item => {
      // Check if documents exist
      if (item.documents && Array.isArray(item.documents)) {
        return item.documents.map(doc => doc.url);
      }
      return []; // Return an empty array if no documents are found
    });
    console.log('Fetched document URLs:', documentUrls); // For debugging
    return documentUrls;
  } catch (error) {
    console.error('Error fetching document URLs from Strapi:', error);
    throw error;
  }
}


async function loadAndSplitChunks({ folderPath, chunkSize, chunkOverlap }) {
  const documents = [];
  const files = fs.readdirSync(folderPath);

  for (const file of files) {
    const filePath = path.join(folderPath, file);
    let rawContent;
    if (filePath.endsWith('.pdf')) {
      const loader = new PDFLoader(filePath);
      rawContent = await loader.load();
    } else if (filePath.endsWith('.txt')) {
      const loader = new TextLoader(filePath);
      rawContent = await loader.load();
    } else {
      console.log(`Skipping file: ${filePath} (Not a PDF or TXT)`);
      continue;
    }

    const splitter = new RecursiveCharacterTextSplitter({ chunkSize, chunkOverlap });
    const splitDoc = await splitter.splitDocuments(rawContent);
    documents.push(...splitDoc);
  }

  console.log('Documents loaded and split:', documents);
  return documents;
}

async function initializeVectorstoreWithDocuments(documents) {
  const embeddings = new OpenAIEmbeddings({
    openAIApiKey: process.env.OPENAI_API_KEY,
  });

  const vectorstore = new MemoryVectorStore(embeddings);
  await vectorstore.addDocuments(documents);
  console.log('Documents added to vector store.');
  return vectorstore;
}

function createDocumentRetrievalChain(retriever) {
  const convertDocsToString = (documents) => {
    return documents.map((document) => `<doc>\n${document.pageContent}\n</doc>`).join('\n');
  };

  const documentRetrievalChain = RunnableSequence.from([
    (input) => input.question,
    retriever,
    convertDocsToString,
  ]);

  return documentRetrievalChain;
}

function createRephraseQuestionChain() {
  const REPHRASE_QUESTION_SYSTEM_TEMPLATE = `
  meet the following objective to the best of your ability:
  `;

  const rephraseQuestionChainPrompt = ChatPromptTemplate.fromMessages([
    ['system', REPHRASE_QUESTION_SYSTEM_TEMPLATE],
    ['human', 'Rephrase the following question or instruction to be standalone:\n{question}'],
  ]);

  const rephraseQuestionChain = RunnableSequence.from([
    rephraseQuestionChainPrompt,
    new ChatOpenAI({
      openAIApiKey: process.env.OPENAI_API_KEY,
      maxTokens: 2048,
      model: "gpt-4o", 
    }),
    new StringOutputParser(),
  ]);
  return rephraseQuestionChain;
}

const ANSWER_CHAIN_SYSTEM_TEMPLATE = `You are a customer service assistant. The messages you reply
 with are served through WhatsApp, so keep replies short and convenient. You are helpful and 
 professional. Interpret and answer the user's question using only the provided sources.

<context>
{context}
</context>
The user's question is: {question}`;

const answerGenerationChainPrompt = ChatPromptTemplate.fromMessages([
  ['system', ANSWER_CHAIN_SYSTEM_TEMPLATE],
  ['human', `Now, answer this question:\n{question}`],
]);

async function createConversationalRetrievalChain(retriever) {
  const rephraseQuestionChain = await createRephraseQuestionChain();

  const conversationalRetrievalChain = RunnableSequence.from([
    RunnablePassthrough.assign({
      question: rephraseQuestionChain,
    }),
    RunnablePassthrough.assign({
      context: createDocumentRetrievalChain(retriever),
    }),
    answerGenerationChainPrompt,
    new ChatOpenAI({
      openAIApiKey: process.env.OPENAI_API_KEY,
      maxTokens: 2048,
      model: "gpt-4o", 

    }),
  ]);

  return conversationalRetrievalChain;
}

export async function chatWithDocs(question) {
  console.log('Fetching document URLs from Strapi...');
  const documentUrls = await fetchDocumentUrlsFromStrapi();

  for (const url of documentUrls) {
    await downloadDocsWithCache(url, cacheFolderPath);
  }

  console.log('Loading and splitting documents...');
  const documents = await loadAndSplitChunks({
    folderPath: cacheFolderPath,
    chunkSize: 1536,
    chunkOverlap: 128,
  });

  console.log('Initializing vector store...');
  const vectorstore = await initializeVectorstoreWithDocuments(documents);
  const retriever = vectorstore.asRetriever();

  console.log('Creating retrieval chain.....');
const finalRetrievalChain = await createConversationalRetrievalChain(retriever);
console.log('Invoking retrieval chain...');
const result = await finalRetrievalChain.invoke({
question: question,
});
console.log('Result:', result);
return result.content; // Ensure to return the content for proper string handling
}
