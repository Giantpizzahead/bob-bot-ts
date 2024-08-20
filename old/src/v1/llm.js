import ollama from 'ollama'
import { OpenAI } from 'openai';

export async function get_ollama_completion(conversation) {
    const response = await ollama.chat({
        model: 'Hermes-2-Theta-Llama-3-8B-Q4_K_M:latest',
        messages: conversation,
    });
    console.log(response);
    return response.message.content;
}
