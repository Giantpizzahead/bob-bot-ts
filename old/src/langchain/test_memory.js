import 'dotenv/config';

// Langchain tests

import { ChatOpenAI } from '@langchain/openai'
import { SystemMessage, HumanMessage, AIMessage } from '@langchain/core/messages';

const llm = new ChatOpenAI({
    apiKey: process.env.OPENAI_KEY,
    model: 'gpt-4o-mini',
    temperature: 1,
    max_tokens: 256,
    top_p: 1,
    frequency_penalty: 0.05,
    presence_penalty: 0.05,
});

const factualLLM = new ChatOpenAI({
    apiKey: process.env.OPENAI_KEY,
    model: 'gpt-4o-mini',
    temperature: 0,
    max_tokens: 256,
    frequency_penalty: 0.05,
    presence_penalty: 0.05,
});

// Memory

import { OpenAIEmbeddings } from '@langchain/openai'
import { VectorStoreRetrieverMemory } from "langchain/memory";
import { ConversationChain } from "langchain/chains";
import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { PromptTemplate } from "@langchain/core/prompts";

const embeddings = new OpenAIEmbeddings({ apiKey: process.env.OPENAI_KEY });
const vectorStore = new MemoryVectorStore(embeddings);
const memory = new VectorStoreRetrieverMemory({
    // 1 is how many documents to return, you might want to return more, eg. 4
    vectorStoreRetriever: vectorStore.asRetriever(3),
    memoryKey: "history",
});

const prompt = PromptTemplate.fromTemplate(`The following is a friendly conversation between a human and an AI. The AI is concise and provides specific details from its context. If the AI does not know the answer to a question, it truthfully says it does not know.

Relevant pieces of previous conversation:
{history}

(You do not need to use these pieces of information if not relevant)

Current conversation:
Human: {input}
AI:`);

const chain = new ConversationChain({
    llm: llm,
    memory: memory,
    prompt: prompt,
});

function formatMessages(messages) {
    return messages.map((message) => {
        const role = message instanceof HumanMessage ? "user" : message instanceof AIMessage ? "ai" : "system";
        return `${role}: ${message.content}`;
    }).join('\n');
}

async function getResponse(message) {
    let variables = await memory.loadMemoryVariables({ input: message });
    variables = variables.history;
    // variables = formatMessages(variables.history.slice(0, 1));
    let response = await chain.invoke({ input: message });
    response = response.response;
    // console.dir(variables);
    // const history = formatMessages((await memory.chatHistory.getMessages()).slice(0, -1));
    // console.log(history);
    // console.log(response);
    // const debugMsg = `===== memory =====\n${JSON.stringify(variables)}\n\n===== response =====\n${response}`;
    const debugMsg = `===== memory =====\n${variables}\n\n===== response =====\n${response}`;
    console.log(debugMsg);
    return debugMsg;
}

// Discord handling

import { Client } from 'discord.js';
import { debug } from 'openai/core.mjs';

const client = new Client({
    intents: ['Guilds', 'GuildMembers', 'GuildMessages', 'MessageContent', 'GuildVoiceStates']
});
client.on('ready', () => { console.log('Bob is now online!'); });

let activeChannel;

function sendDiscordMessage(messageStr) {
    if (!activeChannel) throw new Error('No active channel!');
    activeChannel.send(messageStr.substring(Math.max(messageStr.length - 1980, 0)));
}

const CHANNELS = JSON.parse(process.env.DISCORD_CHANNELS);
client.on('messageCreate', async (message) => {
    if (!CHANNELS.includes(message.channelId) && !message.mentions.users.has(client.user.id)) return;
    if (message.author.bot) return;
    activeChannel = message.channel;
    try {
        sendDiscordMessage(await getResponse(message.content));
    } catch (e) {
        console.log(e);
        sendDiscordMessage(e.toString());
    }
});

client.login(process.env.DISCORD_TOKEN);
