import { ChatCompletionRequestMessage, Configuration, CreateImageRequestSizeEnum, OpenAIApi } from "openai";
import "@logseq/libs";
import { backOff } from "exponential-backoff";

// export type DalleImageSize = 256 | 512 | 1024;
export interface OpenAIOptions {
  apiKey: string;
  completionEngine?: string;
  temperature?: number;
  maxTokens?: number;
  // dalleImageSize?: DalleImageSize;
  chatPrompt?: string;
}

const OpenAIDefaults = (apiKey: string): OpenAIOptions => ({
  apiKey,
  completionEngine: 'bloom-zh-1b1',
  temperature: 1.0,
  maxTokens: 1000,
  // dalleImageSize: 1024,
});

const retryOptions = {
  numOfAttempts: 7,
  retry: (err: any) => {
    if (err instanceof TypeError && err.message === 'Failed to fetch') {
      // Handle the TypeError: Failed to fetch error
      console.warn('retrying due to network error', err);
      return true;
    }

    if (!err.response || !err.response.data || !err.response.data.error) {
      return false;
    }
    if (err.response.status === 429) {
      const errorType = err.response.data.error.type;
      if (errorType === "insufficient_quota") {
        return false;
      }
      console.warn("Rate limit exceeded. Retrying...");
      return true;
    }
    if (err.response.status >= 500){
      return true;
    }

    return false;
  },
};

// export async function whisper(file: File,openAiOptions:OpenAIOptions): Promise<string> {
//     const apiKey = openAiOptions.apiKey;
//     const model = 'whisper-1';
  
//     // Create a FormData object and append the file
//     const formData = new FormData();
//     formData.append('model', model);
//     formData.append('file', file);
  
//     // Send a request to the OpenAI API using a form post
//     const response = await backOff(

//     () => fetch('https://api.openai.com/v1/audio/transcriptions', {
//       method: 'POST',
//       headers: {
//         'Authorization': `Bearer ${apiKey}`,
//       },
//       body: formData,
//     }), retryOptions);
  
//     // Check if the response status is OK
//     if (!response.ok) {
//       throw new Error(`Error transcribing audio: ${response.statusText}`);
//     }
  
//     // Parse the response JSON and extract the transcription
//     const jsonResponse = await response.json();
//     return jsonResponse.text;
//   }
  
// export async function dallE(
//   prompt: string,
//   openAiOptions: OpenAIOptions
// ): Promise<string | undefined> {
//   const options = { ...OpenAIDefaults(openAiOptions.apiKey), ...openAiOptions };

//   const configuration = new Configuration({
//     apiKey: options.apiKey,
//   });

//   const openai = new OpenAIApi(configuration);
//   const imageSizeRequest: CreateImageRequestSizeEnum =
//     `${options.dalleImageSize}x${options.dalleImageSize}` as CreateImageRequestSizeEnum;

//   const response = await backOff(
//     () =>
//       openai.createImage({
//         prompt,
//         n: 1,
//         size: imageSizeRequest,
//       }),
//     retryOptions
//   );
//   return response.data.data[0].url;
// }


// function Chat(

// )
// {
//   var headers = {
//     'accept': 'application/json',
//     'Authorization':
//     'Content-Type': 'application/jsons'
//   }
//   return fetch(
//     'https://create.mtkresearch.com/llm/api/v2/tasks',
//     {
//       method:'POST',
//       headers: headers,
//     }
//   )
// }

// import { ExponentialBackOff } from 'backoff';

// const fetchTaskWithBackoff = async (uuid: string, apiKey: string): Promise<Response> => {
//   // const backoff = new ExponentialBackOff(retryOptions);

//   return new Promise(async (resolve, reject) => {
//     const tryFetch = async () => {
//       try {
//         const response = await fetch('https://create.mtkresearch.com/llm/api/v2/tasks/' + uuid, {
//           method: 'GET',
//           headers: {
//             'accept': 'application/json',
//             'Authorization': `Bearer ${apiKey}`,
//           },
//         });
//         const jsonResponse = await response.json();
//         if (jsonResponse.task.status === 'READY') {
//           resolve(response);
//         } else {
//           backoff.backoff();
//         }
//       } catch (error) {
//         reject(error);
//       }
//     };

//     backoff.failAfter(retryOptions.numOfAttempts);
//     backoff.on('backoff', tryFetch);
//     backoff.on('fail', reject);
//     tryFetch();
//   });
// };

const fetchTaskWithBackoff = async (uuid: string, apiKey: string, retryOptions: { maxNumberOfRetry: number, initialDelay: number, maxDelay: number }): Promise<Response> => {
  let retries = 0;
  const delay = (duration: number) => new Promise(resolve => setTimeout(resolve, duration));

  const tryFetch = async (): Promise<Response> => {
    try {
      const response = await fetch('https://create.mtkresearch.com/llm/api/v2/tasks/' + uuid, {
        method: 'GET',
        headers: {
          'accept': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
      });
      if (!response.ok) {
        // throw new Error(`Error trascribing api: ${response.statusText}`);
        throw new Error(`Error trascribing api: ${response}`);
      }
      const jsonResponse = await response.json();
      // console.log(jsonResponse.task)
      if (jsonResponse["task"]["status"] === 'READY') {
        return jsonResponse.task.outputs[0].text;
      } else {
        if (retries < retryOptions.maxNumberOfRetry) {
          retries++;
          const waitTime = Math.min(retryOptions.initialDelay * 2 ** (retries - 1), retryOptions.maxDelay);
          await delay(waitTime);
          return tryFetch();
        } else {
          throw new Error('Max number of retries reached');
        }
      }
    } catch (error) {
      throw error;
    }
  };

  return tryFetch();
};


function sleep(ms : number)
{
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function openAI(
  input: string,
  openAiOptions: OpenAIOptions
): Promise<string> {
    const apiKey = openAiOptions.apiKey;
    const options = { ...OpenAIDefaults(openAiOptions.apiKey), ...openAiOptions };
    const model = options.completionEngine!;
    // const model = 'bloom-zh-1b1';
  
    var object = {
      "model_type": model,
      "model_object": "text completion",
      "prompt": input,
      "priority": "high"
    };

    var myjson = JSON.stringify(object);

    // Send a request to the OpenAI API using a form post
    const response = await backOff(
  
    () => fetch('https://create.mtkresearch.com/llm/api/v2/tasks', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        // 'content-type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: myjson,
    }), retryOptions);

    // Check if the response status is OK
    if (!response.ok) {
      // throw new Error(`Error trascribing api: ${response.statusText}`);
      throw new Error(`Error trascribing api: ${response}`);
    }

    // Parse the response JSON and extract the transcription
    console.log(response.text)

    const jsonResponse = await response.json();

    // await sleep(5000);

    // let llm_response = await backOff(

    // () => fetch('https://create.mtkresearch.com/llm/api/v2/tasks/'+jsonResponse["task"]["uuid"], {
    //   method: 'GET',
    //   headers: {
    //     'accept': 'application/json',
    //     'Authorization': `Bearer ${apiKey}`
    //   }
    // }), retryOptions);

    // let llm_response = await fetchTaskWithBackoff(jsonResponse["task"]["uuid"], apiKey);
    let output_text = await fetchTaskWithBackoff(jsonResponse["task"]["uuid"], apiKey, { maxNumberOfRetry: 5, initialDelay: 500, maxDelay: 1000 });
    return output_text;
  }

// export async function openAI(
//   input: string,
//   openAiOptions: OpenAIOptions
// ): Promise<string | null> {
//   const options = { ...OpenAIDefaults(openAiOptions.apiKey), ...openAiOptions };
//   const engine = options.completionEngine!;

//   const configuration = new Configuration({
//     apiKey: options.apiKey,
//   });

//   const openai = new OpenAIApi(configuration);
//   try {
//     if (engine.startsWith("gpt-3.5") || engine.startsWith("gpt-4")) {
//       const inputMessages:ChatCompletionRequestMessage[] =  [{ role: "user", content: input }];
//       if (openAiOptions.chatPrompt && openAiOptions.chatPrompt.length > 0) {
//         inputMessages.unshift({ role: "system", content: openAiOptions.chatPrompt });

//       }
//       const response = await backOff(
//         () =>
//           openai.createChatCompletion({
//             messages: inputMessages,
//             temperature: options.temperature,
//             max_tokens: options.maxTokens,
//             top_p: 1,
//             frequency_penalty: 0,
//             presence_penalty: 0,
//             model: engine,
//           }),
//         retryOptions
//       );
//       const choices = response.data.choices;
//       if (
//         choices &&
//         choices[0] &&
//         choices[0].message &&
//         choices[0].message.content &&
//         choices[0].message.content.length > 0
//       ) {
//         return trimLeadingWhitespace(choices[0].message.content);
//       } else {
//         return null;
//       }
//     } else {
//       const response = await backOff(() =>
//         openai.createCompletion({
//           prompt: input,
//           temperature: options.temperature,
//           max_tokens: options.maxTokens,
//           top_p: 1,
//           frequency_penalty: 0,
//           presence_penalty: 0,
//           model: engine,
//         }),
//         retryOptions
//       );
//       const choices = response.data.choices;
//       if (
//         choices &&
//         choices[0] &&
//         choices[0].text &&
//         choices[0].text.length > 0
//       ) {
//         return trimLeadingWhitespace(choices[0].text);
//       } else {
//         return null;
//       }
//     }
//   } catch (e: any) {
//     if (e?.response?.data?.error) {
//       console.error(e?.response?.data?.error);
//       throw new Error(e?.response?.data?.error?.message);
//     } else {
//       throw e;
//     }
//   }
// }

function trimLeadingWhitespace(s: string): string {
  return s.replace(/^\s+/, "");
}
