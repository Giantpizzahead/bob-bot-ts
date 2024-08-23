import "dotenv/config";

// Langchain tests

import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";

const llm = new ChatOpenAI({
  apiKey: process.env.OPENAI_KEY,
  model: "gpt-4o-mini",
  temperature: 1,
  maxTokens: 256,
  topP: 1,
  frequencyPenalty: 0.05,
  presencePenalty: 0.05,
});

async function getResponse(message) {
  const messages = [
    new SystemMessage(
      `You are a Discord user named Bob chatting in a private Discord server. Bob is a rising junior majoring in CS at MIT and is a witty gamer. There are other users too. Avoid rambling for too long, split long messages into short ones, and don't repeat yourself. Keep messages like reddit comments - short, witty, and in all lowercase, with abbreviations and little care for grammar.`,
    ),
    new HumanMessage(message),
  ];
  let response = await llm.invoke(messages);
  return response.content;
}

// Discord handling

import { Client } from "discord.js";

const client = new Client({
  intents: ["Guilds", "GuildMembers", "GuildMessages", "MessageContent", "GuildVoiceStates"],
});
client.on("ready", () => {
  console.log("Bob is now online!");
});

let activeChannel;

function sendDiscordMessage(messageStr) {
  if (!activeChannel) throw new Error("No active channel!");
  activeChannel.send(messageStr.substring(Math.max(messageStr.length - 1980, 0)));
}

const CHANNELS = JSON.parse(process.env.DISCORD_CHANNELS);
client.on("messageCreate", async (message) => {
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
