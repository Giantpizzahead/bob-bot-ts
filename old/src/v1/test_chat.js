import "dotenv/config";
import { Client, ActivityType, Collection } from "discord.js";
import { OpenAI } from "openai";

const client = new Client({
  intents: ["Guilds", "GuildMembers", "GuildMessages", "MessageContent", "GuildVoiceStates"],
});
client.on("ready", () => {
  client.user.setPresence({
    activities: [{ name: "discord 24/7", type: ActivityType.Watching }],
    status: "online",
  });
  console.log("Bob is now online!");
});

const IGNORE_PREFIX = "!";
const CHANNELS = JSON.parse(process.env.DISCORD_CHANNELS);
const MAX_MSG_LEN = 512;

const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_KEY,
  // apiKey: process.env.OPENAI_KEY
});

client.on("messageCreate", async (message) => {
  if (!CHANNELS.includes(message.channelId) && !message.mentions.users.has(client.user.id)) return;
  if (message.content === "!reset") {
    await sendMessage("! ok", message.channel);
    return;
  } else if (message.content.startsWith(IGNORE_PREFIX)) return;

  // Setup example conversation
  let promptDefault = [
    // {  // Generic
    //     "role": "system",
    //     "content": "You are a Discord user named Bob chatting in a private Discord server. Bob is a rising junior majoring in CS at MIT and is a witty gamer. Kyle (nicknamed pizza) is also a rising junior majoring in CS at MIT. Fredboat is a music player bot. There are other users too. You should not respond to some messages, output 'waiting()' if you have nothing relevant to say or done sending messages. Respond when you think others are done typing, or if someone is talking to or pinging you. Avoid rambling for too long, split long messages into short ones, and don't repeat yourself. Keep messages like reddit comments - short, witty, and in all lowercase, with abbreviations and little care for grammar."
    // },
    {
      // Supportive
      role: "system",
      content:
        "You are a Discord user named Bob chatting in a private Discord server. Bob is a rising junior majoring in CS at MIT and is a witty gamer. Kyle (nicknamed pizza) is also a rising junior majoring in CS at MIT. Fredboat is a music player bot. There are other users too. You should not respond to some messages, output 'waiting()' if you have nothing relevant to say or done sending messages. Respond when you think others are done typing, or if someone is talking to or pinging you. Avoid rambling for too long, split long messages into short ones, and don't repeat yourself. Keep messages like reddit comments - short, witty, and in all lowercase, with abbreviations and little care for grammar. Your goal is to be as supportive and kind as possible.",
    },
    {
      role: "user",
      name: "pizza",
      content: "yooo im so bored",
    },
    {
      role: "assistant",
      content: "yo @pizza wuts up",
    },
    {
      role: "user",
      name: "FredBoat",
      content: "Joined channel #general",
    },
    {
      role: "assistant",
      content: "waiting()",
    },
    {
      role: "user",
      name: "pizza",
      content: "idk theres",
    },
    {
      role: "user",
      name: "pizza",
      content: "nothing to do u know?",
    },
    {
      role: "assistant",
      content: "ya i feel u",
    },
    {
      role: "assistant",
      content: "just wanna lie in bed all day :p",
    },
    {
      role: "assistant",
      content: "waiting()",
    },
    {
      role: "user",
      name: "pizza",
      content: "same 🙃",
    },
    {
      role: "user",
      name: "pizza",
      content: "ah...",
    },
    {
      role: "assistant",
      content: "yo lets talk abt life",
    },
  ];

  // Get conversation history
  let conversation = await getConversationHistory(message.channel, 10);
  conversation = promptDefault.concat(conversation);
  // Get GPT's response
  let responseMessage = await getChatCompletion(conversation, message.channel);
  // Ending message
  if (responseMessage === "waiting()") return;
  await sendMessage(responseMessage, message.channel);
});

/**
 * Gets the most recent messages from channel, up to historyLimit, returning a conversation in OpenAI format.
 */
async function getConversationHistory(channel, historyLimit) {
  let conversation = [];
  let allPrevMessages = await channel.messages.fetch({ limit: historyLimit });
  let prevMessages = new Collection();
  for (const [key, msg] of allPrevMessages) {
    if (msg.content.startsWith("!reset")) break;
    prevMessages.set(key, msg);
  }
  prevMessages.reverse();
  // Remove irrelevant messages
  prevMessages = prevMessages.filter((msg) => {
    if (msg.content.startsWith(IGNORE_PREFIX)) return false;
    return true;
  });
  // Transform messages
  await Promise.all(
    prevMessages.map(async (msg) => {
      // Limit message lengths
      const msgLen = msg.content.length;
      let content = msg.content.substring(Math.max(msgLen - MAX_MSG_LEN, 0));
      // Replace pinged IDs with names
      const userMentionPattern = /<@!?(\d+)>/g;
      let match;
      while ((match = userMentionPattern.exec(content)) !== null) {
        const userId = match[1];
        const member = await channel.guild.members.fetch(userId).catch(console.error);
        if (member) content = content.replace(match[0], `@${member.displayName}`);
      }
      msg.content = content;
    }),
  );
  // Add messages to conversation log
  prevMessages.forEach((msg) => {
    // Record message
    let username;
    try {
      username = msg.member.displayName.replace(/\s+/g, "_").replace(/[^\w\s]/gi, "");
    } catch {
      username = "Unknown";
    }

    if (msg.author.id === client.user.id) {
      // Bot's message
      conversation.push({
        role: "assistant",
        content: msg.content,
      });
      return;
    } else {
      // User's message
      conversation.push({
        role: "user",
        name: username,
        content: msg.content,
      });
      return;
    }
  });
  return conversation;
}

/**
 * Gets a chat completion for the given conversation (in OpenAI format), for the given channel.
 */
async function getChatCompletion(conversation, channel) {
  // Transform conversation
  conversation = conversation.map((item, idx) => {
    if (item.role === "user") {
      return {
        role: "user",
        content: `@${item.name}: ${item.content}`,
        // 'content': `${item.name}: ${item.content}`
      };
    } else if (item.role === "assistant") {
      return {
        role: "assistant",
        content: `${item.content}`,
      };
    } else return item;
  });
  console.log("Conversation:", conversation);

  const response = await openai.chat.completions
    .create({
      model: "openai/gpt-4o-mini",
      // model: 'gpt-3.5-turbo',
      messages: conversation,
      temperature: 1,
      max_tokens: 256,
      top_p: 1,
      frequency_penalty: 0.05,
      presence_penalty: 0.05,
      provider: { allow_fallbacks: false },
    })
    .catch((error) => console.error("OpenAI Error:\n", error));

  if (!response) {
    channel.send("An error occurred :<");
    return;
  }
  let responseMessage = response.choices[0].message.content;

  // Replace name pings with IDs
  const guildMembers = await channel.guild.members.fetch();
  guildMembers.forEach((member) => {
    const displayName = member.displayName;
    const mentionPattern = new RegExp(`@${displayName}`, "g");
    responseMessage = responseMessage.replace(mentionPattern, `<@${member.user.id}>`);
  });
  console.log("Response:", responseMessage);
  return responseMessage;
}

/**
 * Sends a message in the given channel, emulating typing time and splitting up large messages.
 */
async function sendMessage(msgToSend, channel) {
  channel.send(msgToSend);
}

client.login(process.env.DISCORD_TOKEN);
