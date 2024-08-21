import "dotenv/config";

// Langchain tests

import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage } from "@langchain/core/messages";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

const llm = new ChatOpenAI({
  apiKey: process.env.OPENAI_KEY,
  model: "gpt-4o-mini",
  temperature: 1,
  max_tokens: 256,
  top_p: 1,
  frequency_penalty: 0.05,
  presence_penalty: 0.05,
});

/**
 * Note that the descriptions here are crucial, as they will be passed along
 * to the model along with the class name.
 */
const calculatorSchema = z.object({
  operation: z.enum(["add", "subtract", "multiply", "divide"]).describe("The type of operation to execute."),
  number1: z.number().describe("The first number to operate on."),
  number2: z.number().describe("The second number to operate on."),
});

const calculatorTool = tool(
  async ({ operation, number1, number2 }) => {
    let result;
    // Functions must return strings
    if (operation === "add") {
      result = `${number1 + number2}`;
    } else if (operation === "subtract") {
      result = `${number1 - number2}`;
    } else if (operation === "multiply") {
      result = `${number1 * number2}`;
    } else if (operation === "divide") {
      result = `${number1 / number2}`;
    } else {
      throw new Error("Invalid operation.");
    }
    sendDiscordMessage(`[Calculator] ${number1} ${operation} ${number2} = ${result}`);
    return result;
  },
  {
    name: "calculator",
    description: "Can perform mathematical operations.",
    schema: calculatorSchema,
  },
);

const toolsByName = {
  calculator: calculatorTool,
};
const llmWithTools = llm.bindTools([calculatorTool]);

async function getResponse(message) {
  const messages = [new HumanMessage(message)];

  // Repeatedly call tools until the AI gives a response
  let aiMessage;
  while (true) {
    aiMessage = await llmWithTools.invoke(messages);
    messages.push(aiMessage);
    if (aiMessage.tool_calls.length !== 0) {
      for (const toolCall of aiMessage.tool_calls) {
        const selectedTool = toolsByName[toolCall.name];
        const toolMessage = await selectedTool.invoke(toolCall);
        messages.push(toolMessage);
      }
    } else break;
  }

  // Output response
  console.log(messages);
  const response = aiMessage.content;
  return response;
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
