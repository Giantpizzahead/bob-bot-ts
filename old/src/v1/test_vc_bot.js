import 'dotenv/config';
import * as fs from 'fs';
import { Client } from 'discord.js';
import { OpenAI } from 'openai';
import {
    entersState, joinVoiceChannel, getVoiceConnection, createAudioResource, createAudioPlayer, 
    VoiceConnectionStatus, VoiceReceiver, EndBehaviorType,
} from '@discordjs/voice';
import * as prism from 'prism-media';
import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk';
import discordTTS from 'discord-tts';

const client = new Client({
    intents: ['Guilds', 'GuildMembers', 'GuildMessages', 'MessageContent', 'GuildVoiceStates']
});
client.on('ready', () => { console.log('Bob is now online!'); });

const IGNORE_PREFIX = '!';
const CHANNELS = JSON.parse(process.env.DISCORD_CHANNELS);

let currStreams = {};
let sttConn;
let currConversation = [];
let latestEndSpeech = performance.now();

const openai = new OpenAI({
    // baseURL: "https://openrouter.ai/api/v1",
    // apiKey: process.env.OPENROUTER_KEY,
    apiKey: process.env.OPENAI_KEY
});
const deepgram = createClient(process.env.DEEPGRAM_KEY);
// Warm up API
deepgram.speak.request({ text: 'Hello!' }, { model: 'aura-arcas-en' });
const player = createAudioPlayer();

/**
 * Handles a new voice message (in VC).
 * @param {string} message 
 * @param {*} channel
 */
async function newVoiceMessage(message, channel) {
    // Keep the last 16 messages as context
    currConversation.push({
        "role": "user",
        "content": message,
    });
    while (currConversation.length > 16) currConversation.shift();

    let time0 = performance.now();
    console.log(`User: ${message}`);
    // sendMessage(`User: ${message}`, channel);

    let fillers = ['Um...', 'Uh...', 'Ah...', 'Eh...', 'Mmm...', 'Ya...'];
    const randomIndex = Math.floor(Math.random() * fillers.length);
    const completionPromise = getChatCompletion(currConversation);
    await textToSpeech(fillers[randomIndex], getVoiceConnection(channel.guild.id));
    const completion = await completionPromise;
    // Save the assistant's reponses
    currConversation.push({
        "role": "assistant",
        "content": completion
    });
    let time1 = performance.now();
    if (Object.keys(currStreams).length !== 0) return;  // Someone else is talking
    console.log(`Bob: ${completion}`);
    // sendMessage(`Bob: ${completion}`, channel);
    if (completion === 'waiting()') return;
    await textToSpeech(completion, getVoiceConnection(channel.guild.id));
    let time2 = performance.now();
    let sttDelay = performance.now() - latestEndSpeech;
    // sendMessage(`${(sttDelay).toFixed(0)} ms sst, ` +
    //             `${(time1 - time0).toFixed(0)} ms gpt, ` +
    //             `${(time2 - time1).toFixed(0)} ms tts, ` +
    //             `${(sttDelay + time2 - time0).toFixed(0)} ms total`, channel);

    // Averages ~1000 ms GPT delay, ~500 ms TTS delay for GPT-4o-mini
    // GPT's timing is inconsistent from 500-2000 ms... server lag, not good.
}

async function initSTTStream(channel) {
    // Create a websocket connection to Deepgram
    sttConn = deepgram.listen.live({
        smart_format: true,
        filler_words: true,
        interim_results: true,
        model: 'nova-2',
        language: 'en-US',
    });
    setInterval(() => {
        sttConn.keepAlive();
    }, 3000);  // Sending KeepAlive messages every 3 seconds

    // Listen for the connection to open.
    sttConn.on(LiveTranscriptionEvents.Open, () => {
        sttConn.on(LiveTranscriptionEvents.Transcript, async (data) => {
            const transcript = data.channel.alternatives[0].transcript;
            if (transcript.trim().length === 0) return;
            player.pause(true);  // Don't play while someone is talking
            if (data.speech_final) newVoiceMessage(transcript, channel);
            // console.dir(data, { depth: null });
        });

        sttConn.on(LiveTranscriptionEvents.Metadata, (data) => {});

        sttConn.on(LiveTranscriptionEvents.Close, () => {
            console.log("Connection closed.");
        });

        sttConn.on(LiveTranscriptionEvents.Error, async (data) => console.error(data));
    });
}

/**
 * Listens to the given user, starting a new stream if none exists for them yet.
 * @param {VoiceReceiver} receiver 
 * @param {string} userId 
 * @param {GuildMember} member 
 * @param {*} channel 
 */
async function listenTo(receiver, userId, member, channel) {
    if (userId in currStreams) return;  // Only have one listening stream at a time
    
    const opusStream = receiver.subscribe(userId, {
		end: {
			behavior: EndBehaviorType.AfterSilence,
			duration: 200,
		},
	});
    currStreams[userId] = opusStream;

	const oggStream = new prism.opus.OggLogicalBitstream({
		opusHead: new prism.opus.OpusHead({
			channelCount: 1,
			sampleRate: 48000,
		}),
		pageSizeControl: {
			maxPackets: 10,
		},
	});
    oggStream.on('readable', () => {
        let chunk;
        while (null !== (chunk = oggStream.read())) sttConn.send(chunk);
    })

    opusStream.pipe(oggStream);
    opusStream.on('end', async () => {
        delete currStreams[userId];
        // await sendMessage(`${member.displayName} stopped talking`, channel);
    })
}

/**
 * Does text-to-speech.
 */
async function textToSpeech(text, connection) {
    if (text.trim().length === 0) return;

    const response = await deepgram.speak.request(
        { text },
        { model: 'aura-arcas-en' }
    );
    const stream = await response.getStream();
    // const stream = discordTTS.getVoiceStream(text);
    const resource = createAudioResource(stream, {inlineVolume: false});
    player.play(resource);
}

/**
 * Gets a chat completion for the given conversation (in OpenAI format), for the given channel.
 */
async function getChatCompletion(conversation) {
    // Setup example conversation
    let promptDefault = [
        {  // Generic
            "role": "system",
            "content": "You are a Discord user named Bob chatting in a private Discord voice call. Bob is a rising junior majoring in CS at MIT and is a witty gamer. Kyle (nicknamed pizza) is also a rising junior majoring in CS at MIT. Fredboat is a music player bot. There are other users too. Avoid rambling for too long, split long messages into short ones, and don't repeat yourself. Keep messages very short and witty, but nicely formatted and without emojis, and use words that can be spoken. You can use 3 dots (...) to create a longer pause, and filler words (um and uh)."
        },
        {
            "role": "user",
            "content": "Yo! I'm so bored.",
        },
        {
            "role": "assistant",
            "content": "Yo pizza... What's up?",
        },
        {
            "role": "user",
            "content": "Uh, I don't know, like there's um, nothing to do, you know?",
        },
        {
            "role": "assistant",
            "content": "Yeah... I feel you... Just wanna lie in bed all day!",
        },
        {
            "role": "user",
            "content": "Same! Ah...",
        },
        {
            "role": "assistant",
            "content": "Yo uh, let's talk about life!",
        },
    ];
    // Get completion with system prompt
    conversation = promptDefault.concat(conversation);
    const response = await openai.chat.completions
        .create({
            model: 'gpt-4o-mini',
            // model: 'nousresearch/nous-hermes-2-mistral-7b-dpo',
            messages: conversation,
            temperature: 1,
            max_tokens: 256,
            top_p: 1,
            frequency_penalty: 0.05,
            presence_penalty: 0.05,
            // provider: { order: ['Fireworks', 'DeepInfra'], allow_fallbacks: false }
            // provider: { allow_fallbacks: false }
        })
        .catch((error) => console.error('OpenAI Error:\n', error));
    
    // Might respond with forbidden if using moderated model on OpenRouter
    // console.log(response);
    if (!response) {
        channel.send('An error occurred :<');
        return;
    }
    let responseMessage = response.choices[0].message.content;
    console.log(`Response: ${responseMessage}`);
    return responseMessage;
}

client.on('messageCreate', async (message) => {
    if (!CHANNELS.includes(message.channelId) && !message.mentions.users.has(client.user.id)) return;
    if (message.author.bot) return;
    
    if (message.content === '!help') {
        await sendMessage('hi i am bob, voice chat edition\n!vc, !dc, !log', message.channel);
        return;
    } else if (message.content === '!vc') {
        // Join VC
        const channel = message.member.voice.channel;
        const connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: channel.guild.id,
            selfDeaf: false,
            adapterCreator: channel.guild.voiceAdapterCreator,
        });

        // Record when talking
        try {
            await entersState(connection, VoiceConnectionStatus.Ready, 20000);
            const receiver = connection.receiver;
            connection.subscribe(player);  // Play audio

            // Initially listen to anyone who is already talking
            setTimeout(async () => {
                for (const userId of receiver.speaking.users.keys()) {
                    console.log('Listening initially...');
                    await listenTo(receiver, userId, channel.guild.members.cache.get(userId), message.channel);
                }
            }, 100);

            // Potentially start a new audio stream if a user is talking
            receiver.speaking.on('start', async (userId) => {
                await listenTo(receiver, userId, channel.guild.members.cache.get(userId), message.channel);
            });

            // Debug timings
            receiver.speaking.on('end', async () => latestEndSpeech = performance.now());
        } catch (error) {
            console.warn(error);
            await sendMessage(error.toString(), message.channel);
        }

        initSTTStream(message.channel);
        currConversation = [];  // Reset convo
        await sendMessage('hopping on - say hi!', message.channel);
        return;
    } else if (message.content === '!dc') {
        message.channel.send('ok bye D:');
        const oldConnection = getVoiceConnection(message.guild.id);
        if (oldConnection) oldConnection.disconnect();
    } else if (message.content === '!log') {
        const convoString = currConversation.map(msg => `${msg.role === 'user' ? 'User' : 'Bob'}: ${msg.content}`).join('\n');
        message.channel.send(`conversation history:\n${convoString}`);
    }
    if (message.content.startsWith(IGNORE_PREFIX)) return;
});

/**
 * Sends a message in the given channel, emulating typing time and splitting up large messages.
 */
async function sendMessage(msgToSend, channel) {
    if (typeof msgToSend === 'string' && msgToSend.trim().length === 0) return;
    channel.send(msgToSend);
}

client.login(process.env.DISCORD_TOKEN);
