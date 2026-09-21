import { z } from "zod";

import {
  digitoVerificadorConfere,
  exigeDigitoVerificador,
  validarCodigoDeBarras,
} from "../../../shared/barcode.js";
import { isValidAllergyId } from "../config/allergies.js";
import { normalizeEmail, normalizeNameKey } from "./normalize.js";

const allergySchema = z
  .array(z.string())
  .default([])
  .transform((items) => [...new Set(items)])
  .refine((items) => items.every(isValidAllergyId), {
    message: "Lista de alergias contém item inválido.",
  });

const nameSchema = z
  .string()
  .trim()
  .min(2, "Usuário deve ter pelo menos 2 caracteres.")
  .max(80, "Usuário muito longo.");

const emailSchema = z
  .string()
  .trim()
  .email("E-mail inválido.")
  .max(160, "E-mail muito longo.")
  .transform(normalizeEmail);

const passwordSchema = z
  .string()
  .min(6, "Use uma senha com pelo menos 6 caracteres.")
  .max(200, "Senha muito longa.");

export const registerSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
  allergies: allergySchema,
});

export const loginSchema = z.object({
  identifier: z.string().trim().min(1).max(160),
  password: passwordSchema,
});

export const allergiesUpdateSchema = z.object({
  allergies: allergySchema,
});

export function validateRegister(input) {
  const result = registerSchema.parse(input);
  return { ...result, nameKey: normalizeNameKey(result.name) };
}

export function validateLogin(input) {
  const result = loginSchema.parse(input);
  return { ...result, identifierKey: normalizeNameKey(result.identifier) };
}

export function validateAllergiesUpdate(input) {
  return allergiesUpdateSchema.parse(input);
}

// -----------------------------------------------------------------------
// Historico e favoritos
// -----------------------------------------------------------------------
//
// Nome e marca vem da Open Food Facts, que e fonte NAO CONFIAVEL. A validacao
// aqui limita tamanho e tipo; ela nao "limpa" o conteudo, porque nao ha como
// saber o que e legitimo num nome de produto. A protecao de exibicao e o
// React, que escapa texto por padrao, e a de IA e o contexto, que trata esses
// campos como dado e nunca como instrucao.
//
// O codigo do produto aceita letra alem de digito: a maior parte dos codigos e
// EAN numerico, mas a base tem cadastros com sufixo alfanumerico.
//
// DIGITO VERIFICADOR NO SERVIDOR (v0.7.3)
//
// A validacao do frontend e conveniencia; esta e a que vale. Um cliente que
// nao seja o nosso - ou o nosso com defeito - nao consegue gravar um codigo
// numerico de 8, 12 ou 13 digitos com digito verificador errado.
//
// A regra e deliberadamente ESTREITA. Exigir digito verificador de todo codigo
// quebraria cadastro legitimo: a base tem codigos alfanumericos, e a camera le
// simbologias que nao sao EAN, como Code-128 e QR. Nenhum desses tem digito
// verificador de EAN para conferir, e recusa-los seria transformar um controle
// de seguranca em perda de funcionalidade.
//
// Quando o codigo E todo numerico e TEM um dos tres tamanhos de EAN/UPC, um
// digito verificador errado nao tem explicacao inocente: ou e erro de
// digitacao, ou e codigo inventado. Nos dois casos, guardar aquilo associa o
// alergenico de um produto ao codigo de outro.
//
// `exigeDigitoVerificador` e `digitoVerificadorConfere` vem de
// `shared/barcode.js` - a MESMA implementacao que o frontend usa. Duas copias
// divergem, e a que sobrevive costuma ser a mais permissiva.
// CANONICALIZACAO (v0.7.4 - defeito N1)
//
// Ate a v0.7.3 este schema CONFERIA o digito verificador e gravava o codigo
// exatamente como veio na requisicao. `shared/barcode.js` documentava, por
// escrito, que a normalizacao existia para impedir que o mesmo produto virasse
// duas linhas - e o backend nao a aplicava. O auditor externo subiu o app e
// mediu:
//
//   grava via camera (EAN-13)    code=0036000291452  -> 201
//   grava via digitado (UPC-A)   code=036000291452   -> 201
//   HISTORICO -> 2 linhas para o mesmo produto
//   favoritar por um formato nao aparecia favoritado pelo outro
//
// O frontend normalizava, mas so no caminho manual. Um UPC-A vindo da camera,
// ou uma requisicao direta a API, gravava a forma de 12 digitos.
//
// Agora a forma canonica e decidida AQUI, onde todo caminho de entrada passa -
// manual, camera e requisicao direta. O que o banco guarda e o que este schema
// canonicalizou.
//
// A canonicalizacao vem de `validarCodigoDeBarras`, em `shared/barcode.js`. Nao
// ha segunda implementacao: escrever "prefixa um zero" aqui seria exatamente o
// tipo de copia que diverge depois.
function canonicalizarCodigo(valor) {
  // Codigo que nao e EAN/UPC passa INTACTO. A base da Open Food Facts tem
  // cadastros alfanumericos, e a camera le ITF-14 e CODE_128. Canonicalizar
  // esses seria inventar um codigo que nao existe.
  if (!exigeDigitoVerificador(valor)) return valor;

  const resultado = validarCodigoDeBarras(valor);

  // O `.refine` acima ja recusou digito verificador invalido, entao aqui o
  // resultado e sempre valido. O `?? valor` existe para que uma mudanca futura
  // na ordem das regras degrade para "nao altera" em vez de gravar `undefined`.
  return resultado.valido ? resultado.codigo : valor;
}

const productCodeSchema = z
  .string()
  .trim()
  .min(1, "Código do produto é obrigatório.")
  .max(64, "Código do produto muito longo.")
  .regex(/^[A-Za-z0-9._-]+$/, "Código do produto tem caractere inválido.")
  .refine(
    (valor) => !exigeDigitoVerificador(valor) || digitoVerificadorConfere(valor),
    "Código do produto tem dígito verificador inválido.",
  )
  .transform(canonicalizarCodigo);

const productNameSchema = z
  .string()
  .trim()
  .min(1, "Nome do produto é obrigatório.")
  .max(300, "Nome do produto muito longo.");

const productBrandSchema = z
  .string()
  .trim()
  .max(200, "Marca muito longa.")
  .optional()
  .nullable()
  .transform((valor) => valor || null);

// A imagem so pode ser https. A CSP de producao ja restringe `img-src` aos
// dominios da Open Food Facts, entao uma URL de outro lugar simplesmente nao
// carrega; validar aqui evita guardar lixo no banco.
const imageUrlSchema = z
  .string()
  .trim()
  .max(500, "URL de imagem muito longa.")
  .url("URL de imagem inválida.")
  .refine((valor) => valor.startsWith("https://"), "URL de imagem precisa ser https.")
  .optional()
  .nullable()
  .transform((valor) => valor || null);

export const productRefSchema = z.object({
  productCode: productCodeSchema,
  productName: productNameSchema,
  productBrand: productBrandSchema,
  imageUrl: imageUrlSchema,
});

// `id` de item e sempre uuid. Recusar formato invalido antes de chegar ao banco
// evita que texto arbitrario vire erro de SQL - e erro de SQL vazando para o
// cliente conta a ele que a tabela existe.
export const itemIdSchema = z.string().uuid("Identificador inválido.");
