import 'dotenv/config';
import * as fs from 'fs';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream';
import { Client } from 'discord.js';
import {
    entersState, joinVoiceChannel, getVoiceConnection, createAudioResource, createAudioPlayer, 
    VoiceConnectionStatus, VoiceReceiver, EndBehaviorType
} from '@discordjs/voice';
import * as prism from 'prism-media';
import { createClient } from '@deepgram/sdk';
import { channel } from 'diagnostics_channel';

const client = new Client({
    intents: ['Guilds', 'GuildMembers', 'GuildMessages', 'MessageContent', 'GuildVoiceStates']
});
client.on('ready', () => { console.log('Bob is now online!'); });

const IGNORE_PREFIX = '!';
const CHANNELS = JSON.parse(process.env.DISCORD_CHANNELS);

/**
 * Does text-to-speech.
 * @param {string} filename 
 * @param {*} channel 
 */
async function textToSpeech(text, connection) {
    const deepgramApiKey = process.env.DEEPGRAM_KEY;

    // Initializes the Deepgram SDK
    const deepgram = createClient(deepgramApiKey);
    const response = await deepgram.speak.request(
        { text },
        { model: 'aura-arcas-en' }
    );

    const stream = await response.getStream();
    const resource = createAudioResource(stream, {inlineVolume: false});
    const player = createAudioPlayer();
    player.play(resource);
    connection.subscribe(player);

    // await sendMessage(result.results.channels[0].alternatives[0].transcript, channel);
}

client.on('messageCreate', async (message) => {
    if (!CHANNELS.includes(message.channelId) && !message.mentions.users.has(client.user.id)) return;
    if (message.author.bot) return;
    
    if (message.content === '!reset') {
        await sendMessage('ok', message.channel);
        return;
    } else if (message.content.startsWith('!tts')) {
        if (message.content.length === 4) {
            message.channel.send('! u forgot text dummy');
            return;
        } else message.channel.send('! ok');

        // Join VC
        const channel = message.member.voice.channel;
        const connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: channel.guild.id,
            selfDeaf: false,
            adapterCreator: channel.guild.voiceAdapterCreator,
        });
        textToSpeech(message.content.substring(5, 205), connection);

        await sendMessage('joined', message.channel);
        return;
    }

    if (message.content.startsWith(IGNORE_PREFIX)) return;
    await sendMessage('hi', message.channel);
});

/**
 * Sends a message in the given channel, emulating typing time and splitting up large messages.
 */
async function sendMessage(msgToSend, channel) {
    if (typeof msgToSend === 'string' && msgToSend.trim().length === 0) return;
    channel.send(msgToSend);
}

client.login(process.env.DISCORD_TOKEN);
