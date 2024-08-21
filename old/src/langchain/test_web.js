import "dotenv/config";

// Langchain tests

import { ChatOpenAI, OpenAIEmbeddings } from "@langchain/openai";
import { SystemMessage, HumanMessage, AIMessage } from "@langchain/core/messages";
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

const factualLLM = new ChatOpenAI({
  apiKey: process.env.OPENAI_KEY,
  model: "gpt-4o-mini",
  temperature: 0,
  max_tokens: 256,
  frequency_penalty: 0.05,
  presence_penalty: 0.05,
});

import Exa from "exa-js";

const exaClient = new Exa(process.env.EXASEARCH_API_KEY);

import { DuckDuckGoSearch } from "@langchain/community/tools/duckduckgo_search";

const searchTool = new DuckDuckGoSearch({ maxResults: 7 });

import { WebBrowser } from "langchain/tools/webbrowser";

const embeddings = new OpenAIEmbeddings({ apiKey: process.env.OPENAI_KEY });
const browser = new WebBrowser({ model: factualLLM, embeddings });

const fetchWebpageSchema = z.object({
  url: z.string().describe("The URL of the webpage to fetch."),
  prompt: z
    .string()
    .describe(
      "A prompt for the LLM, which will read the text on the webpage and attempt to answer the prompt based on the content it finds.",
    ),
});

const fetchWebpageTool = tool(
  async ({ url, prompt }) => {
    const result = await browser.invoke(`"${url}","${prompt}"`);
    console.log(result);
    const splitLoc = result.indexOf("### Relevant Links");
    sendDiscordMessage(`-> ${result.substring(0, splitLoc)}\n\n`);
    return result;
  },
  {
    name: "fetch-webpage",
    description:
      "Can answer a prompt about the contents of a webpage at a given URL. Useful for finding and collecting specific info.",
    schema: fetchWebpageSchema,
  },
);

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
    sendDiscordMessage(`-> ${result}`);
    return result;
  },
  {
    name: "calculator",
    description: "Can perform mathematical operations.",
    schema: calculatorSchema,
  },
);

const toolsByName = {
  "duckduckgo-search": searchTool,
  "fetch-webpage": fetchWebpageTool,
  calculator: calculatorTool,
};
const llmWithTools = llm.bindTools([searchTool, fetchWebpageTool, calculatorTool]);

async function getResponse(message) {
  const currDateTime = new Date().toLocaleString("en-GB", {
    weekday: "long", // e.g., "Monday"
    year: "numeric", // e.g., "2024"
    month: "long", // e.g., "August"
    day: "numeric", // e.g., "19"
    hour: "numeric", // e.g., "10"
    minute: "numeric", // e.g., "30"
    hour12: true, // e.g., "AM/PM" notation
    timeZone: "PST",
  });
  const messages = [
    new SystemMessage(
      `You are a Discord user named Bob chatting in a private Discord server. Bob is a rising junior majoring in CS at MIT and is a witty gamer. There are other users too. Avoid rambling for too long, split long messages into short ones, and don't repeat yourself. Keep messages like reddit comments - short, witty, and in all lowercase, with abbreviations and little care for grammar. Use the web search tool to get context before answering the user (if needed). DO NOT USE duckduckgo-search MORE THAN TWICE. Don't send links to the user. If you really don't know the answer, say you don't know - do not make up info. The current date is ${currDateTime}.`,
    ),
    new HumanMessage(message),
  ];
  console.log(currDateTime);
  const sources = [];

  // Repeatedly call tools until the AI gives a response
  let aiMessage;
  for (let i = 0; i < 7; i++) {
    aiMessage = await llmWithTools.invoke(messages);
    messages.push(aiMessage);
    if (aiMessage.tool_calls.length !== 0) {
      for (const toolCall of aiMessage.tool_calls) {
        let debugMsg = `[${toolCall.name}] with arguments ${JSON.stringify(toolCall.args).replace("https://", "")}`;
        sendDiscordMessage(debugMsg);
        const selectedTool = toolsByName[toolCall.name];
        const toolMessage = await selectedTool.invoke(toolCall);
        if (toolCall.name === "exa_search_results_json") {
          const toolOutput = JSON.parse(toolMessage.content);
          for (let result of toolOutput.results) {
            sources.push(`[${sources.length + 1}] ${result.title} <${result.url}>`);
          }
        } else if (toolCall.name === "duckduckgo-search") {
          const toolOutput = JSON.parse(toolMessage.content);
          // // Get contents of each page
          // const pageURLs = toolOutput.slice(0, 2).map(result => result.link);
          // console.log(`Getting contents of ${pageURLs.join('; ')}`);
          // const contents = await exaClient.getContents(
          //     pageURLs,
          //     { text: { maxCharacters: 2048 } },
          // );
          // console.log(contents);
          // for (let i = 0; i < Math.min(toolOutput.length, contents.results.length); i++) {
          //     const result = toolOutput[i];
          //     result.text = contents.results[i].text.trim();
          // }
          let debugMsg = "->\n";
          for (const result of toolOutput) {
            debugMsg += `[${result.title}](<${result.link}>)\n`;
            sources.push(`[${sources.length + 1}] [${result.title}](<${result.link}>)\n*${result.snippet}*`);
          }
          sendDiscordMessage(debugMsg);
          toolMessage.content = JSON.stringify(toolOutput);
        } else if (toolCall.name === "web-browser") {
          console.log(toolMessage.content);
        }
        messages.push(toolMessage);
      }
    } else break;
  }

  // Output response
  console.log(messages);
  let response = aiMessage.content;
  if (response.trim().length === 0) response = "Unable to answer within 7 iterations D:";
  let fullResponse = `\n\n${response}`;
  // let fullResponse = sources.length > 0 ? `Sources:\n${sources.join('\n')}\n\n${response}` : response;
  return fullResponse;
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
