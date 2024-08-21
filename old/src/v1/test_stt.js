import "dotenv/config";
import * as fs from "fs";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream";
import { Client } from "discord.js";
import {
  entersState,
  joinVoiceChannel,
  getVoiceConnection,
  createAudioResource,
  createAudioPlayer,
  VoiceConnectionStatus,
  VoiceReceiver,
  EndBehaviorType,
} from "@discordjs/voice";
import * as prism from "prism-media";
import { createClient } from "@deepgram/sdk";
import { channel } from "diagnostics_channel";

const client = new Client({
  intents: ["Guilds", "GuildMembers", "GuildMessages", "MessageContent", "GuildVoiceStates"],
});
client.on("ready", () => {
  console.log("Bob is now online!");
});

const IGNORE_PREFIX = "!";
const CHANNELS = JSON.parse(process.env.DISCORD_CHANNELS);

let currStreams = {};

/**
 * Listens to the given user, starting a new stream if none exists for them yet.
 * @param {VoiceReceiver} receiver
 * @param {string} userId
 * @param {GuildMember} member
 * @param {*} channel
 */
async function listenTo(receiver, userId, member, channel) {
  if (userId in currStreams) return; // Only have one listening stream at a time

  const opusStream = receiver.subscribe(userId, {
    end: {
      behavior: EndBehaviorType.AfterSilence,
      duration: 1000,
    },
  });
  currStreams[userId] = opusStream;

  const oggStream = new prism.opus.OggLogicalBitstream({
    opusHead: new prism.opus.OpusHead({
      channelCount: 2,
      sampleRate: 48000,
    }),
    pageSizeControl: {
      maxPackets: 10,
    },
  });

  const filename = `./recordings/${Date.now()}-${member.displayName}.ogg`;
  const out = createWriteStream(filename);

  pipeline(opusStream, oggStream, out, async (err) => {
    delete currStreams[userId];
    if (err) {
      await sendMessage(`❌ Error recording file ${filename} - ${err.message}`, channel);
    } else {
      await sendMessage(
        {
          content: `${member.displayName} said:`,
          files: [filename],
        },
        channel,
      );
      await speechToText(filename, channel);
    }
  });
}

/**
 * Does speech-to-text for the given audio file.
 * @param {string} filename
 * @param {*} channel
 */
async function speechToText(filename, channel) {
  const deepgramApiKey = process.env.DEEPGRAM_KEY;

  // Initializes the Deepgram SDK
  const deepgram = createClient(deepgramApiKey);

  const { result, error } = await deepgram.listen.prerecorded.transcribeFile(fs.readFileSync(filename), {
    smart_format: true,
    model: "nova-2",
    language: "en-US",
  });

  if (error) throw error;

  console.dir(result, { depth: null });
  await sendMessage(result.results.channels[0].alternatives[0].transcript, channel);
}

client.on("messageCreate", async (message) => {
  if (!CHANNELS.includes(message.channelId) && !message.mentions.users.has(client.user.id)) return;
  if (message.author.bot) return;

  if (message.content === "!reset") {
    await sendMessage("ok", message.channel);
    return;
  } else if (message.content === "!join") {
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

      // Potentially start a new audio stream if a user is talking
      receiver.speaking.on("start", async (userId) => {
        await listenTo(receiver, userId, channel.guild.members.cache.get(userId), message.channel);
      });
    } catch (error) {
      console.warn(error);
      await sendMessage(error.toString(), message.channel);
    }

    await sendMessage("joined", message.channel);
    return;
  }

  if (message.content.startsWith(IGNORE_PREFIX)) return;
  await sendMessage("hi", message.channel);
});

/**
 * Sends a message in the given channel, emulating typing time and splitting up large messages.
 */
async function sendMessage(msgToSend, channel) {
  if (typeof msgToSend === "string" && msgToSend.trim().length === 0) return;
  channel.send(msgToSend);
}

client.login(process.env.DISCORD_TOKEN);
