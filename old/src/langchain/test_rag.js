import 'dotenv/config';

// Langchain tests

import { ChatOpenAI } from '@langchain/openai'
import { PromptTemplate } from '@langchain/core/prompts'
import { OpenAIEmbeddings } from '@langchain/openai'
import { SupabaseVectorStore } from '@langchain/community/vectorstores/supabase'
import { StringOutputParser } from '@langchain/core/output_parsers'
import { RunnablePassthrough, RunnableSequence } from '@langchain/core/runnables'
import { createClient } from '@supabase/supabase-js'

// Create the embedding helper and vector store retriever
const embeddings = new OpenAIEmbeddings({ apiKey: process.env.OPENAI_KEY });
const supabaseClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const vectorStore = new SupabaseVectorStore(embeddings, {
    client: supabaseClient,
    tableName: 'documents',
    queryName: 'match_documents'
});
const retriever = vectorStore.asRetriever(4);

const llm = new ChatOpenAI({
    apiKey: process.env.OPENAI_KEY,
    model: 'gpt-4o-mini',
    temperature: 1,
    max_tokens: 256,
    top_p: 1,
    frequency_penalty: 0.05,
    presence_penalty: 0.05,
});

async function getResponse(message) {
    // const standaloneQuestionTemplate = 'Given a question, convert it to a standalone question. question: {question} standalone question:';
    const standaloneQuestionTemplate = 'Given a user message, convert it into a concise lookup question. Answering this standalone question should give enough context to accurately respond to the user.\nUser message: {question}';
    const standaloneQuestionPrompt = PromptTemplate.fromTemplate(standaloneQuestionTemplate);
    PromptTemplate.fromExamples()

    // const answerTemplate = `You are a helpful and enthusiastic support bot who can answer a given question about League of Legends Swarm based on the context provided. Try to find the answer in the context. If you really don't know the answer, say "I'm sorry, I don't know the answer to that." And direct the questioner to search on Google instead. Don't try to make up an answer. Always speak as if you were chatting to a friend.
    // context: {context}
    // question: {question}
    // answer: `;
    const answerTemplate = `You are a Discord user named Bob chatting in a private Discord server. Bob is a rising junior majoring in CS at MIT and is a witty gamer. There are other users too. Avoid rambling for too long, split long messages into short ones, and don't repeat yourself. Keep messages like reddit comments - short, witty, and in all lowercase, with abbreviations and little care for grammar.\n===== Context =====\n{context}\n\n===== User message =====\n{question}`;
    const answerPrompt = PromptTemplate.fromTemplate(answerTemplate);
    let lookupDebug = 'Lookup: ';
    let sourcesDebug = 'Sources:\n';

    const standaloneQuestionChain = standaloneQuestionPrompt
        .pipe(input => {
            const debugMsg = `\n\nDebug (start of standalone question): ${input}`
            console.log(debugMsg);
            return input;
        })
        .pipe(llm)
        .pipe(new StringOutputParser());

    const combineDocuments = (docs) => docs.map((doc) => doc.pageContent).join('\n\n');
    const retrieverChain = RunnableSequence.from([
        prevResult => prevResult.standaloneQuestion,
        input => {
            lookupDebug += input;
            const debugMsg = `\n\nDebug (start of retriever): ${input}`;
            console.log(debugMsg);
            return input;
        },
        retriever,
        documents => {
            for (let i = 0; i < documents.length; i++) {
                sourcesDebug += `[${i+1}] ${documents[i].pageContent.substring(0, 64).replace(/\n/g, '  ')}...\n`;
            }
            return documents;
        },
        combineDocuments,
    ]);
    
    const answerChain = answerPrompt
        .pipe(input => {
            const debugMsg = `\n\nDebug (start of answer): ${input}`
            console.log(debugMsg);
            return input;
        })
        .pipe(llm)
        .pipe(new StringOutputParser());

    const chain = RunnableSequence.from([
        {
            standaloneQuestion: standaloneQuestionChain,
            origInput: new RunnablePassthrough()
        },
        {
            context: retrieverChain,
            question: ({ origInput }) => origInput.question
        },
        answerChain
    ]);

    const answer = await chain.invoke({ question: message });
    const response = `${lookupDebug}\n${sourcesDebug}\n\n${answer}`;
    console.log(`\n\nResponse:\n${response}`);
    return answer;
}

// Discord handling

import { Client } from 'discord.js';

const client = new Client({
    intents: ['Guilds', 'GuildMembers', 'GuildMessages', 'MessageContent', 'GuildVoiceStates']
});
client.on('ready', () => { console.log('Bob is now online!'); });

const CHANNELS = JSON.parse(process.env.DISCORD_CHANNELS);
client.on('messageCreate', async (message) => {
    if (!CHANNELS.includes(message.channelId) && !message.mentions.users.has(client.user.id)) return;
    if (message.author.bot) return;

    // message.channel.send('hello i am bob');
    message.channel.send(await getResponse(message.content));
});

client.login(process.env.DISCORD_TOKEN);
