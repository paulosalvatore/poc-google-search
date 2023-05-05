import { useState } from "react";
import { Form, useActionData, useNavigation } from "@remix-run/react";
import axios from "axios";
import type { ActionFunction, LoaderFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import invariant from "tiny-invariant";

interface ImageResult {
  link: string;
  displayLink: string;
  title: string;
}

const buildPrompt = (query: string): string => `
É muito importante que a sua mensagem de resposta não contenha nenhuma explicação ou texto, apenas o resultado da forma mais simples possível, seguindo o exemplo a seguir:
["termo 1", "termo 2", "termo 3"]

------ Agora, vamos às instruções.

Estou criando uma API simples que faz pesquisas em imagens no Google e retorna a lista de imagens.
O objetivo principal dessa ferramenta é pegar uma estrutura de tópicos que estou organizando para montar uma aula e trazer imagens relevantes para ilustrar o tema.
Dessa forma, gostaria de automatizar essa geração de imagens usando ChatGPT.

Portanto, para o texto da aula, traga o termo de pesquisa completo que devo usar para extrair imagens. É importante que você traga uma lista de termos de pesquisa mais detalhados, para que a imagem buscada seja o mais próximo possível da realidade.
Como vou usar isso em um software, traga uma lista dos termos já estrutura em JavaScript, sem nenhuma informação extra, apenas o código necessário para criar a lista de termos e fazer a pesquisa.
É importante que tenha apenas 3 termos, selecionados da melhor forma para representar a ideia do texto da aula.


----- Texto da aula:

${query}

Resposta:
`;

export let action: ActionFunction = async ({ request }) => {
  const formData = await request.formData();
  const query = formData.get("query") as string;

  invariant(process.env.OPENAI_API_KEY, "OPENAI_API_KEY must be set");
  invariant(process.env.CUSTOM_SEARCH_KEY, "CUSTOM_SEARCH_KEY must be set");
  invariant(process.env.CUSTOM_SEARCH_CX, "CUSTOM_SEARCH_CX must be set");

  const client = axios.create({
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
  });

  const gptResponse = await client.post(
    "https://api.openai.com/v1/completions",
    {
      model: "text-davinci-003",
      prompt: buildPrompt(query),
      max_tokens: 256,
    }
  );

  const gptResult = gptResponse.data.choices[0]?.text;

  try {
    JSON.parse(gptResult);
  } catch (e) {
    return json({ error: "Invalid response from GPT" }, { status: 400 });
  }

  const gptResultAsArray = JSON.parse(gptResult);

  if (!Array.isArray(gptResultAsArray)) {
    return json({ error: "Invalid response from GPT" }, { status: 400 });
  }

  const results: ImageResult[] = (
    await Promise.all(
      gptResultAsArray.map(async (term: string) => {
        const searchResponse = await axios.get(
          "https://www.googleapis.com/customsearch/v1",
          {
            params: {
              key: process.env.CUSTOM_SEARCH_KEY,
              cx: process.env.CUSTOM_SEARCH_CX,
              q: term,
              searchType: "image",
            },
          }
        );

        return searchResponse.data.items.map((item) => ({
          link: item.link,
          displayLink: item.displayLink,
          title: item.title,
        }));
      })
    )
  ).flat();

  return json({ searchTerms: gptResultAsArray, results });
};

export let loader: LoaderFunction = async () => {
  return json({});
};

export default function Search() {
  const [query, setQuery] = useState("");
  const actionData = useActionData<{
    searchTerms: string[];
    results: ImageResult[];
  }>();

  const navigation = useNavigation();

  return (
    <div className="p-4">
      <Form method="post">
        <div className="">
          <textarea
            className="h-32 w-full border p-2"
            name="query"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
            }}
            placeholder="Digite o texto da aula aqui"
          />
        </div>

        <div className="">
          <button className="w-full border p-2" type="submit">
            {navigation.state === "idle" ? "Buscar" : "Buscando..."}
          </button>
        </div>
      </Form>

      {actionData?.searchTerms && (
        <div className="mt-2">
          <h2 className="text-xl">Termos de pesquisa</h2>
          <ul>
            {actionData?.searchTerms?.map((term, index) => (
              <li key={index}>{term}</li>
            ))}
          </ul>
        </div>
      )}

      {actionData?.results && (
        <div className="flex flex-wrap">
          Resultados: {actionData.results.length}
          {actionData.results.map((result, index) => (
            <div key={index} className="mt-2">
              <a href={result.link} target="_blank" rel="noopener noreferrer">
                <img
                  src={result.link}
                  alt={result.title}
                  className="max-w-xs"
                />
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
