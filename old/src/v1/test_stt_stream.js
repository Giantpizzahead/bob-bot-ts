import "dotenv/config";
import * as fs from "fs";
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
import { createClient, LiveTranscriptionEvents } from "@deepgram/sdk";

const client = new Client({
  intents: ["Guilds", "GuildMembers", "GuildMessages", "MessageContent", "GuildVoiceStates"],
});
client.on("ready", () => {
  console.log("Bob is now online!");
});

const IGNORE_PREFIX = "!";
const CHANNELS = JSON.parse(process.env.DISCORD_CHANNELS);

let currStreams = {};
let sttConn;

async function initSTTStream(channel) {
  const deepgramApiKey = process.env.DEEPGRAM_KEY;

  // URL for the real-time streaming audio you would like to transcribe
  // const url = "http://stream.live.vc.bbcmedia.co.uk/bbc_world_service";

  // Initialize the Deepgram SDK
  const deepgram = createClient(deepgramApiKey);

  // Create a websocket connection to Deepgram
  sttConn = deepgram.listen.live({
    smart_format: true,
    filler_words: true,
    model: "nova-2",
    language: "en-US",
    interim_results: true,
  });
  setInterval(() => {
    sttConn.keepAlive();
  }, 3000); // Sending KeepAlive messages every 3 seconds

  // Listen for the connection to open.
  sttConn.on(LiveTranscriptionEvents.Open, () => {
    sttConn.on(LiveTranscriptionEvents.Transcript, async (data) => {
      const transcript = data.channel.alternatives[0].transcript;
      await sendMessage(transcript, channel);
      console.log(transcript);
      console.dir(data, { depth: null });
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
      channelCount: 1,
      sampleRate: 48000,
    }),
    pageSizeControl: {
      maxPackets: 10,
    },
  });
  oggStream.on("readable", () => {
    let chunk;
    while (null !== (chunk = oggStream.read())) sttConn.send(chunk);
  });

  opusStream.pipe(oggStream);
  opusStream.on("end", async () => {
    delete currStreams[userId];
    // await sendMessage(`${member.displayName} stopped talking`, channel);
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

      // Initially listen to anyone who is already talking
      setTimeout(async () => {
        for (const userId of receiver.speaking.users.keys()) {
          console.log("Listening initially...");
          await listenTo(receiver, userId, channel.guild.members.cache.get(userId), message.channel);
        }
      }, 500);

      // Potentially start a new audio stream if a user is talking
      receiver.speaking.on("start", async (userId) => {
        await listenTo(receiver, userId, channel.guild.members.cache.get(userId), message.channel);
      });
    } catch (error) {
      console.warn(error);
      await sendMessage(error.toString(), message.channel);
    }

    initSTTStream(message.channel);
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
