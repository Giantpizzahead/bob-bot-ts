import "dotenv/config";
import { Client, ActivityType, Collection } from "discord.js";
import { OpenAI } from "openai";
import axios from "axios";
// import { ConversationChain, BufferMemory } from 'langchain/memory';

const client = new Client({
  intents: ["Guilds", "GuildMembers", "GuildMessages", "MessageContent", "GuildVoiceStates"],
});

client.on("ready", () => {
  client.user.setPresence({
    activities: [{ name: "discord 24/7", type: ActivityType.Playing }],
    status: "online",
  });
  console.log("Bob is now online!");
});

const IGNORE_PREFIX = "!";
const CHANNELS = JSON.parse(process.env.DISCORD_CHANNELS);
const MAX_MSG_LEN = 768;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_KEY,
});

// const bufferMemory = new ConversationBufferMemory();
// const convChain = new ConversationChain({ llm: openai, bufferMemory });

let messageCounts = {};
let modes = {};
let lastMessage;

/**
 * Checks if the provided URL leads to an image.
 */
async function isImageUrl(url) {
  try {
    const response = await axios.head(url);
    const contentType = response.headers["content-type"];
    return contentType.startsWith("image/");
  } catch (error) {
    console.error("Error checking URL:", error);
    return false;
  }
}

/**
 * Gets the most recent messages from channel, up to historyLimit, returning a conversation in OpenAI format.
 */
async function getConversationHistory(channel, historyLimit) {
  let currMode = modes[channel.id] ?? "instant"; // Mode of the bot

  let conversation = [];
  let allPrevMessages = await channel.messages.fetch({ limit: historyLimit });
  let prevMessages = new Collection();
  for (const [key, msg] of allPrevMessages) {
    if (msg.content.startsWith("! set mode to")) break;
    prevMessages.set(key, msg);
  }
  prevMessages.reverse();
  // Remove irrelevant messages
  prevMessages = prevMessages.filter((msg) => {
    // if (msg.author.bot && msg.author.id !== client.user.id) return false;
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
      // Check for an image attachment
      if (msg.attachments.size > 0) {
        let imageFound = false;
        for (let attachment of msg.attachments.values()) {
          // console.dir(attachment);
          if (await isImageUrl(attachment.url)) {
            console.log(`Image URL: ${attachment.url}`);
            // Set this as the only attachment
            msg.attachments[0] = attachment;
            imageFound = true;
            break;
          } else {
            console.log(`Bad URL: ${attachment.url}`);
          }
        }
        msg.attachments.length = imageFound ? 1 : 0;
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

    let image = undefined;
    if (msg.attachments.size > 0) image = msg.attachments.first().url;

    if (msg.author.id === client.user.id) {
      // Bot's message
      conversation.push({
        role: "assistant",
        content: msg.content,
        image: image,
      });
      return;
    } else {
      // User's message
      conversation.push({
        role: "user",
        name: username,
        content: msg.content,
        image: image,
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
    let content = item.role === "user" ? `@${item.name}: ${item.content}` : item.content;
    // Only send an image if it's in the most recent message
    if (item.image !== undefined && idx === conversation.length - 1) {
      content = [
        {
          type: "text",
          text: content,
        },
        {
          type: "image_url",
          image_url: { url: item.image },
        },
      ];
    }
    return {
      role: item.role,
      content: content,
    };
  });
  console.log("Conversation:", conversation);

  // // Get the response from Langchain's conversation
  // const response = await convChain.call({
  //     input: conversation,
  // });
  // console.log(response);

  const response = await openai.chat.completions
    .create({
      model: "gpt-4o-mini",
      messages: conversation,
      temperature: 1,
      max_tokens: 256,
      top_p: 1,
      frequency_penalty: 0.05,
      presence_penalty: 0.05,
      // provider: { allow_fallbacks: false }
    })
    .catch((error) => console.error("OpenAI Error:\n", error));

  // Output response in chunks
  if (!response) {
    channel.send("An error occurred :<");
    return;
  }
  console.log(response);
  let responseMessage = response.choices[0].message.content;
  // let responseMessage = response;

  // Replace name pings with IDs
  const guildMembers = await channel.guild.members.fetch();
  guildMembers.forEach((member) => {
    // Match usernames with spaces (which are converted into underscores)
    const displayName = member.displayName;
    const escapedDisplayName = displayName.replace(/\s/g, "\\s");
    const mentionPattern = new RegExp(`@${escapedDisplayName}|@${displayName.replace(/\s/g, "_")}`, "g");
    responseMessage = responseMessage.replace(mentionPattern, `<@${member.user.id}>`);
  });
  console.log("Response:", responseMessage);

  return responseMessage;
}

/**
 * Sends a message in the given channel, emulating typing time and splitting up large messages.
 */
async function sendMessage(msgToSend, channel) {
  let currMessageCount = messageCounts[channel.id] ?? 0; // Record new message
  let currMode = modes[channel.id] ?? "instant"; // Mode of the bot
  if (currMode === "off" || msgToSend.trim().length === 0) return; // Empty message

  // Emulate typing time
  const chunkSizeLimit = 2000;
  let i = 0;
  while (i < msgToSend.length) {
    let j = Math.min(i + chunkSizeLimit, msgToSend.length); // Ending of this message
    let chunk = msgToSend.substring(i, j);
    i = j;
    let typingTime = Math.random() * 2000 + (Math.random() / 2 + 1) * 75 * chunk.length; // ~200 WPM
    typingTime = Math.min(typingTime, 8000 + Math.random() * 4000); // Max ~10 seconds to send a message
    if (currMode === "instant") typingTime = 0; // Send message instantly
    await channel.sendTyping();
    const sendTypingInterval = setInterval(() => {
      let newMode = modes[channel.id] ?? "instant";
      if (newMode === currMode && currMessageCount === messageCounts[channel.id]) channel.sendTyping();
    }, 5000);
    await new Promise((resolve, reject) =>
      setTimeout(async () => {
        clearInterval(sendTypingInterval);
        let newMode = modes[channel.id] ?? "instant";
        if (newMode === currMode && currMessageCount === messageCounts[channel.id]) {
          // Only send if message is not outdated
          try {
            await channel.send(chunk);
          } catch (error) {
            console.log(error);
          }
        }
        resolve();
      }, typingTime),
    );
  }
}

client.on("messageCreate", async (message) => {
  if (!CHANNELS.includes(message.channelId) && !message.mentions.users.has(client.user.id)) return;

  const currentTime = new Date();
  const currentUTCHour = currentTime.getUTCHours();
  const dayOfWeek = currentTime.getDay();
  if (currentUTCHour >= 17 && currentUTCHour < 23 && dayOfWeek >= 1 && dayOfWeek <= 5) {
    // Work hours
    if (!message.mentions.users.has(client.user.id)) return;
    message.channel.send("https://tenor.com/view/mochi-peach-work-annoying-gif-11281690480465316781");
    setTimeout(() => message.channel.send("sorry i am working rn (10-4), u should too :)"), 1000);
    return;
  } else if (currentUTCHour >= 8 && currentUTCHour < 13) {
    // Sleep hours
    if (!message.mentions.users.has(client.user.id)) return;
    message.channel.send("https://tenor.com/view/zzz-hello-kitty-gif-12194146");
    setTimeout(() => message.channel.send("go to sleep (1-6)..."), 1000);
    return;
  }

  let currMode = modes[message.channelId] ?? "instant"; // Mode of the bot
  modes[message.channelId] = currMode;
  if (!message.author.bot) lastMessage = message;

  // Commands
  if (message.content === "!help") {
    message.channel.send(
      "! hi i am bare bones bob\nmodes: !default, !instant, !off, !getmode\nmisc: !ping\n\nwhen changing modes, all message history prior to the mode change is cleared.",
    );
  } else if (["!default", "!instant", "!off"].includes(message.content)) {
    const mode = message.content.substring(1);
    message.channel.send(`! set mode to ${mode}`);
    modes[message.channelId] = mode;
  } else if (message.content === "!getmode") {
    message.channel.send(`! current mode: ${currMode}`);
  } else if (message.content === "!ping") {
    message.react("📍");
    message.reply("!pong");
  }

  if (message.content.startsWith(IGNORE_PREFIX) || currMode === "off") return;

  let currMessageCount = messageCounts[message.channelId] ?? 0; // Record new message
  messageCounts[message.channelId] = ++currMessageCount;

  if (currMode === "instant" && message.author.bot) return;
  console.log("\n\nMode:", currMode);
  console.log("Current message count:", messageCounts[message.channelId]);

  // Setup example conversation
  let promptDefault = [
    {
      role: "system",
      content:
        "You are a Discord user named Bob chatting in a private Discord server. Bob is a rising junior majoring in CS at MIT and is a witty gamer. Fredboat is a music player bot. There are other users too. You should not respond to some messages, output `waiting()` if you have nothing relevant to say or done sending messages. Respond when you think others are done typing, or if someone is talking to or pinging you. Avoid rambling for too long, split long messages into short ones, and don't repeat yourself. Keep messages like reddit comments - short, witty, and in all lowercase, with abbreviations and little care for grammar.",
    },
    {
      role: "user",
      name: "Brush_29",
      content: "yooo im so bored",
    },
    {
      role: "assistant",
      content: "yo @Brush_29 wuts up",
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
      name: "Brush_29",
      content: "idk theres",
    },
    {
      role: "user",
      name: "Brush_29",
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
      name: "Brush_29",
      content: "same 🙃",
    },
    {
      role: "user",
      name: "Brush_29",
      content: "ah...",
    },
    {
      role: "assistant",
      content: "yo lets talk abt life",
    },
  ];
  let promptInstant = [
    {
      role: "system",
      content:
        "You are a Discord user named Bob chatting in a private Discord server. Bob is a rising junior majoring in CS at MIT and is a witty gamer. Fredboat is a music player bot. There are other users too. Avoid rambling for too long, split long messages into short ones, and don't repeat yourself. Keep messages like reddit comments - short, witty, and in all lowercase, with abbreviations and little care for grammar.",
    },
    {
      role: "user",
      name: "Brush_29",
      content: "yooo im so bored",
    },
    {
      role: "assistant",
      content: "yo @Brush_29 wuts up",
    },
    {
      role: "user",
      name: "Brush_29",
      content: "idk theres nothing to do",
    },
    {
      role: "assistant",
      content: "ya i feel u, just wanna lie in bed all day :p",
    },
    {
      role: "user",
      name: "Brush_29",
      content: "same 🙃",
    },
    {
      role: "assistant",
      content: "yo lets talk abt life",
    },
  ];

  // Get conversation history
  const historyLimit = 10;
  let conversation = await getConversationHistory(message.channel, historyLimit);

  // Choose initial conversation to add
  let convoToAdd;
  if (currMode === "default") convoToAdd = promptDefault;
  else if (currMode === "instant") convoToAdd = promptInstant;
  else convoToAdd = [];
  conversation = convoToAdd.concat(conversation);

  // Get GPT's response
  let responseMessage = await getChatCompletion(conversation, message.channel);
  if (currMessageCount !== messageCounts[message.channelId] || responseMessage.includes("waiting()")) return;
  await sendMessage(responseMessage, message.channel);
});

client.login(process.env.DISCORD_TOKEN);
