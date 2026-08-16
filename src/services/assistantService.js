import { ALLERGY_OPTIONS } from "../data/allergens.js";
import { formatNumber } from "../utils/formatting.js";
import { getIngredients, getProductName } from "../utils/product.js";
import { getNutrientValue } from "../utils/nutrition.js";
import { hasAnyTerm, hasTextIntent, normalizeIntentText, normalizeText } from "../utils/text.js";

function getMentionedAllergies(query) {
  return ALLERGY_OPTIONS.filter((option) =>
    hasTextIntent(query, [...option.terms, option.label]),
  );
}

function getMentionedFood(query) {
  const normalizedQuery = normalizeIntentText(query);
  const foods = [
    "chocolate",
    "achocolatado",
    "barra de cereal",
    "cereal",
    "leite",
    "iogurte",
    "queijo",
    "requeijão",
    "manteiga",
    "pão",
    "bolo",
    "biscoito",
    "bolacha",
    "sorvete",
    "pizza",
    "hamburguer",
    "hambúrguer",
    "macarrão",
    "massa",
    "arroz",
    "feijão",
    "frango",
    "banana",
    "ovo",
    "amendoim",
    "castanha",
    "granola",
    "maionese",
    "molho",
    "refrigerante",
    "coca cola",
    "suco",
    "suco de caixinha",
  ];
  const matches = foods.filter((food) => hasTextIntent(normalizedQuery, [food]));
  const subjectMatch = normalizedQuery.match(/^(.+?)\s+(tem|leva|contem|possui|pode conter)\s+/);

  if (matches.length > 1 && subjectMatch) {
    const subjectFoods = matches.filter((food) =>
      hasTextIntent(subjectMatch[1], [food]),
    );
    if (subjectFoods.length) {
      return subjectFoods.sort(
        (a, b) =>
          subjectMatch[1].lastIndexOf(normalizeIntentText(b)) -
          subjectMatch[1].lastIndexOf(normalizeIntentText(a)),
      )[0];
    }
  }

  return matches
    .sort(
      (a, b) =>
        normalizedQuery.lastIndexOf(normalizeIntentText(b)) -
        normalizedQuery.lastIndexOf(normalizeIntentText(a)),
    )[0] || "";
}

function buildIngredientAdvice(food) {
  const ingredientMap = {
    chocolate:
      "Chocolate costuma ter massa de cacau, açúcar, manteiga de cacau e, dependendo do tipo, leite em pó ou soro de leite. Também pode ter emulsificante como lecitina de soja e aromatizante. O ponto importante é olhar se o rótulo diz 'contém leite', 'contém lactose', 'contém soja' ou 'pode conter amendoim/castanhas'.",
    achocolatado:
      "Achocolatado geralmente tem açúcar, cacau em pó, maltodextrina ou outros carboidratos, vitaminas/minerais adicionados e aromatizantes. Alguns podem conter leite ou traços, então vale conferir o alerta de alergênicos.",
    "barra de cereal":
      "Barra de cereal costuma ter cereais, xarope de glicose ou açúcar, aveia, arroz/cereal crocante, frutas, chocolate ou castanhas. Pode conter glúten, leite, soja, amendoim ou castanhas dependendo da marca.",
    leite:
      "Leite tem basicamente leite, mas pode variar entre integral, semidesnatado, desnatado, sem lactose ou bebida láctea. Para alergia a leite, mesmo leite sem lactose não é necessariamente seguro, porque ainda pode ter proteína do leite.",
    iogurte:
      "Iogurte geralmente tem leite e fermentos lácteos. Versões saborizadas podem ter açúcar, frutas, corantes, aromatizantes e espessantes. Para lactose/leite, precisa conferir se é sem lactose e se há proteína do leite.",
    queijo:
      "Queijo normalmente é feito de leite, fermento, sal e coalho. Para alergia a leite ou lactose, exige cuidado, porque mesmo que alguns queijos tenham menos lactose, continuam tendo proteína do leite.",
    pão:
      "Pão geralmente tem farinha de trigo, água, fermento e sal. Pode ter açúcar, gordura, leite, ovos ou melhoradores. Para glúten, trigo é o principal ponto de atenção.",
    bolo:
      "Bolo costuma ter farinha de trigo, açúcar, ovos, leite ou derivados, óleo/manteiga e fermento. É comum ter glúten, leite e ovo.",
    biscoito:
      "Biscoito costuma ter farinha, açúcar, gordura vegetal, sal, fermentos e aromatizantes. Muitos têm glúten, leite, soja ou traços de amendoim/castanhas.",
    bolacha:
      "Bolacha costuma ter farinha, açúcar, gordura vegetal, sal e aromatizantes. Muitos produtos têm glúten, leite, soja ou traços, então o rótulo manda.",
    sorvete:
      "Sorvete geralmente tem leite ou derivados, açúcar, gordura, estabilizantes e saborizantes. Para lactose ou alergia a leite, precisa de muita atenção; picolés de fruta podem ser opção, mas também precisam de rótulo.",
    pizza:
      "Pizza costuma ter massa com farinha de trigo, molho, queijo e recheios. Pode envolver glúten, leite e outros alergênicos dependendo do sabor.",
    hamburguer:
      "Hambúrguer pode ter pão com trigo/glúten, carne, queijo, molhos, ovo, soja e conservantes, dependendo da montagem. Se for industrializado, olhe também proteína de soja, leite em pó e traços.",
    macarrão:
      "Macarrão comum geralmente é feito de farinha de trigo ou sêmola e água, então costuma conter glúten. Algumas massas têm ovos. Versões sem glúten usam arroz, milho, mandioca ou grão-de-bico.",
    massa:
      "Massas podem levar trigo, ovos, leite ou recheios com queijo. Para glúten, procure versões certificadas sem glúten; para leite/ovo, confira a lista completa.",
    ovo:
      "Ovo é o próprio ingrediente, mas em produtos aparece como ovo, clara, gema, albumina ou ovo em pó.",
    amendoim:
      "Amendoim pode aparecer como amendoim, pasta de amendoim, farinha de amendoim ou óleo de amendoim. Também é comum aparecer em aviso de 'pode conter'.",
    castanha:
      "Castanhas podem aparecer como castanha-de-caju, castanha-do-pará, amêndoa, avelã, nozes, pistache ou macadâmia. Para alergia forte, também olhe avisos de traços.",
    granola:
      "Granola costuma ter aveia, açúcar ou mel, frutas secas, sementes e castanhas. Pode conter glúten por contaminação da aveia, além de amendoim, castanhas, leite ou soja dependendo da marca.",
    maionese:
      "Maionese geralmente tem óleo, água, ovo ou derivados, vinagre/limão e temperos. Algumas versões não têm ovo, mas precisa conferir o rótulo.",
    molho:
      "Molhos podem ter leite, soja, trigo, ovo, castanhas, corantes e conservantes. Como varia muito, a parte de alergênicos do rótulo é essencial.",
    refrigerante:
      "Refrigerante costuma ter água gaseificada, açúcar ou adoçantes, acidulantes, conservantes, corantes, aromas e cafeína em alguns sabores. Normalmente não é fonte de nutrientes importantes.",
    "coca cola":
      "Refrigerantes de cola costumam ter água gaseificada, açúcar ou adoçantes, corante caramelo, acidulante, aromas e cafeína. Para alergia, confira o rótulo específico; para saúde geral, atenção ao açúcar ou aos adoçantes.",
    suco:
      "Suco pode ser fruta, água, açúcar, conservantes e aromas, dependendo se é natural, néctar ou refresco. Para alergias, olhe corantes, traços e ingredientes adicionados.",
    "suco de caixinha":
      "Suco de caixinha muitas vezes é néctar ou refresco, com água, açúcar, suco concentrado, acidulante, aromas e conservantes. Vale comparar açúcar por porção.",
  };

  return (
    ingredientMap[food] ||
    `Eu não tenho uma ficha completa de ingredientes para ${food || "esse alimento"} sem ver o rótulo. Mas posso te orientar assim: olhe a lista de ingredientes, depois a linha de alergênicos com "contém" e "pode conter". Se você me disser sua alergia, eu aponto quais termos procurar.`
  );
}

function buildAllergyAdvice(food, mentionedAllergies, profileRisks = []) {
  const allergyLabels = mentionedAllergies.length
    ? mentionedAllergies.map((allergy) => allergy.label)
    : profileRisks.map((risk) => risk.label);
  const hasMilkRisk = allergyLabels.some((label) => normalizeText(label).includes("leite"));
  const hasGlutenRisk = allergyLabels.some((label) => normalizeText(label).includes("gluten"));
  const foodLabel = food || "esse alimento";

  if (hasMilkRisk && food === "chocolate") {
    return "Depende do chocolate. Se você tem alergia/intolerância a lactose ou leite, evite chocolate que tenha leite em pó, soro de leite, manteiga, creme de leite, caseína ou a frase 'contém leite/lactose'. Chocolate meio amargo ou 70% às vezes não tem leite, mas muitos ainda têm traços. Então a resposta segura é: só coma se o rótulo disser claramente que não contém leite/lactose e se for seguro para o seu nível de sensibilidade.";
  }

  if (hasMilkRisk) {
    return `Para ${foodLabel}, procure no rótulo termos como leite, lactose, soro de leite, leite em pó, caseína, creme de leite e manteiga. Se aparecer qualquer um deles, eu evitaria. Se disser "pode conter leite", depende da gravidade da sua alergia: para alergia forte, o mais seguro é não consumir.`;
  }

  if (hasGlutenRisk) {
    return `Para ${foodLabel}, confira se aparece trigo, cevada, centeio, malte, aveia contaminada ou "contém glúten". Se você tem doença celíaca ou reação forte, também olhe "pode conter glúten", porque contaminação cruzada pode importar.`;
  }

  if (allergyLabels.length) {
    return `Para ${foodLabel}, eu olharia primeiro a lista de ingredientes e os alertas "contém" ou "pode conter". Como você mencionou ${allergyLabels.join(", ")}, o mais seguro é evitar se o rótulo citar esse ingrediente, derivados ou risco de traços.`;
  }

  return `Para ${foodLabel}, me diga qual alergia ou restrição você tem que eu consigo te orientar melhor.`;
}

export function buildAssistantAnswer(product, question, allergyScan = {}) {
  const profileRisks = allergyScan.profileRisks || [];
  const allRisks = allergyScan.allRisks || [];
  const hasAllergenData = allergyScan.hasData !== false;

  const query = normalizeText(question);
  const mentionedAllergies = getMentionedAllergies(query);
  const mentionedFood = getMentionedFood(query);

  const mentionedIds = mentionedAllergies.map((item) => item.id || item);
  const conversationRisks = allRisks.filter((risk) => mentionedIds.includes(risk.id));
  const relevantRisks = [...profileRisks];
  conversationRisks.forEach((risk) => {
    if (!relevantRisks.some((item) => item.id === risk.id)) relevantRisks.push(risk);
  });

  const describeRisks = (risks) =>
    risks
      .map((risk) => (risk.severity === "traces" ? `${risk.label} (pode conter traços)` : risk.label))
      .join(", ");
  const askedGreeting = hasAnyTerm(query, ["oi", "ola", "olá", "e ai", "ei"]);
  const askedWellBeing =
    hasAnyTerm(query, ["tudo bem", "como vai", "beleza", "bom dia", "boa tarde", "boa noite"]);
  const askedIdentity =
    hasAnyTerm(query, ["quem é você", "quem e voce", "você funciona", "voce funciona"]) ||
    query.includes("o que voce e") ||
    query.includes("o que você é");
  const askedThanks = hasAnyTerm(query, ["obrigado", "obrigada", "valeu"]);
  const askedHelp =
    hasAnyTerm(query, ["me ajuda", "ajuda", "preciso de ajuda"]) ||
    query.includes("como faço") ||
    query.includes("como faco");
  const askedName = hasAnyTerm(query, ["nome"]) || query.includes("se chama");
  const askedIngredients = hasTextIntent(query, [
    "ingrediente",
    "ingredientes",
    "o que tem",
    "do que é feito",
    "do que e feito",
    "tem o que",
    "composição",
    "composicao",
    "leva o que",
    "leva leite",
    "leva lactose",
    "leva gluten",
    "leva glúten",
    "leva ovo",
    "leva soja",
    "leva amendoim",
    "leva castanha",
    "contém leite",
    "contem leite",
    "contém lactose",
    "contem lactose",
    "contém gluten",
    "contem gluten",
    "contém glúten",
    "contem glúten",
    "contém ovo",
    "contem ovo",
    "contém soja",
    "contem soja",
    "possui leite",
    "possui lactose",
    "possui gluten",
    "possui glúten",
    "possui ovo",
    "possui soja",
    "tem leite",
    "tem lactose",
    "tem gluten",
    "tem glúten",
    "tem amendoim",
    "tem ovo",
    "tem soja",
    "pode conter",
    "traços",
    "tracos",
  ]);
  const askedCapability =
    query.includes("o que voce faz") ||
    query.includes("o que você faz") ||
    query.includes("consegue fazer") ||
    query.includes("pra que serve") ||
    query.includes("para que serve");
  const askedGoodChoice =
    query.includes("boa escolha") ||
    query.includes("vale a pena") ||
    query.includes("saudavel") ||
    query.includes("saudável") ||
    query.includes("bom pra mim") ||
    query.includes("bom para mim");
  const askedCanEat =
    query.includes("posso comer") ||
    query.includes("pode comer") ||
    query.includes("posso beber") ||
    query.includes("pode beber") ||
    query.includes("da pra comer") ||
    query.includes("dá pra comer") ||
    query.includes("da para comer") ||
    query.includes("dá para comer") ||
    query.includes("devo comer") ||
    query.includes("devo evitar") ||
    query.includes("eu posso") ||
    query.includes("liberado") ||
    query.includes("é liberado") ||
    query.includes("e liberado") ||
    query.includes("posso tomar") ||
    query.includes("é seguro") ||
    query.includes("e seguro") ||
    query.includes("seguro para mim") ||
    query.includes("faz mal") ||
    query.includes("tem problema") ||
    query.includes("me faz mal") ||
    query.includes("vai me fazer mal");
  const askedAllergyAdvice =
    askedCanEat ||
    query.includes("alerg") ||
    query.includes("intoler") ||
    query.includes("lactose") ||
    query.includes("restricao") ||
    query.includes("restrição") ||
    query.includes("não posso") ||
    query.includes("nao posso") ||
    query.includes("pode conter") ||
    query.includes("contém") ||
    query.includes("contem") ||
    query.includes("traços") ||
    query.includes("tracos") ||
    query.includes("celiaco") ||
    query.includes("celíaco") ||
    query.includes("sou sensivel") ||
    query.includes("sou sensível") ||
    mentionedAllergies.length > 0;
  const askedSymptoms =
    query.includes("dor") ||
    query.includes("enjoo") ||
    query.includes("nausea") ||
    query.includes("náusea") ||
    query.includes("vomit") ||
    query.includes("diarre") ||
    query.includes("coceira") ||
    query.includes("inch") ||
    query.includes("falta de ar") ||
    query.includes("passando mal") ||
    query.includes("reacao") ||
    query.includes("reação");
  const urgentSymptoms =
    query.includes("falta de ar") ||
    query.includes("lingua") ||
    query.includes("língua") ||
    query.includes("garganta") ||
    query.includes("desma") ||
    query.includes("peito") ||
    query.includes("anafil") ||
    query.includes("rosto inch");

  if (!product) {
    if (urgentSymptoms) {
      return "Isso pode ser sinal de alerta. Se tiver falta de ar, inchaço na língua/garganta/rosto, desmaio, dor forte no peito ou piora rápida, procure emergência agora. Se for algo leve, me diga o que você comeu, quando começou e quais sintomas está sentindo.";
    }

    if (askedIngredients && mentionedFood) {
      const ingredientAdvice = buildIngredientAdvice(mentionedFood);
      if (askedAllergyAdvice || mentionedAllergies.length) {
        return `${ingredientAdvice}\n\nPensando na sua restrição: ${buildAllergyAdvice(
          mentionedFood,
          mentionedAllergies,
          profileRisks,
        )}`;
      }
      return ingredientAdvice;
    }

    if (askedAllergyAdvice && (mentionedAllergies.length || mentionedFood)) {
      return buildAllergyAdvice(mentionedFood, mentionedAllergies, profileRisks);
    }

    if (askedSymptoms) {
      return "Entendi. Me conta um pouco melhor: o que você comeu, quanto tempo depois começou, quais sintomas apareceram e se você tem alguma alergia conhecida. Se tiver falta de ar, inchaço, desmaio ou piora rápida, aí é caso de procurar atendimento imediatamente.";
    }

    if (askedGreeting) {
      return "Oi, estou por aqui. Pode mandar sua pergunta do jeito que você falaria com uma pessoa mesmo. Se quiser, também posso analisar um alimento depois que você pesquisar ou escanear.";
    }

    if (askedWellBeing) {
      return "Tudo certo por aqui. E com você? Me fala o que você quer ver: um alimento, uma alergia, uma dúvida de rótulo ou só conversar um pouco sobre alimentação.";
    }

    if (askedName) {
      return "Pode me chamar de Nutri Assistente. Eu sou um chat local do app, feito para conversar e ajudar com alimentos, rótulos, alergias e dúvidas simples de saúde.";
    }

    if (askedCapability) {
      return "Eu consigo conversar com você, explicar rótulos, falar sobre ingredientes, ajudar com alergias marcadas no perfil e analisar calorias, açúcar, sódio e proteínas quando tiver um produto selecionado.";
    }

    if (askedIdentity) {
      return "Eu sou o Nutri Assistente. Não sou um médico real, mas posso conversar de forma natural e te ajudar a entender alimentação, rótulos, ingredientes e alergias.";
    }

    if (askedThanks) {
      return "De nada. Sempre que quiser, manda outra pergunta. Se você selecionar um produto, eu consigo responder com bem mais contexto.";
    }

    if (askedHelp) {
      return "Posso sim. Me pergunte normalmente, tipo: 'esse produto é bom?', 'tem muito açúcar?', 'sou alérgico a leite, posso comer?' ou 'passei mal depois de comer, o que devo observar?'.";
    }

    return "Entendi. Posso conversar sobre isso com você. Se a dúvida for sobre alimento, alergia ou rótulo, fica ainda melhor se você pesquisar ou escanear um produto primeiro.";
  }

  const name = getProductName(product);
  const ingredients = getIngredients(product);
  const kcal = getNutrientValue(product, "energy-kcal");
  const proteins = getNutrientValue(product, "proteins");
  const sugars = getNutrientValue(product, "sugars");
  const sodium = getNutrientValue(product, "sodium");

  if (urgentSymptoms) {
    return `Se você teve reação após consumir ${name} e há falta de ar, inchaço em rosto/língua/garganta, desmaio, dor forte no peito ou piora rápida, procure emergência imediatamente. O produto pode ter ingredientes relevantes, mas nesse cenário o mais seguro é atendimento agora.`;
  }

  if (askedIngredients || query.includes("ingred")) {
    const ingredientAnswer = ingredients
      ? `Ingredientes cadastrados de ${name}: ${ingredients}`
      : `Ainda não há ingredientes cadastrados para ${name}. Confira o rótulo físico antes de consumir.`;

    if (askedAllergyAdvice || mentionedAllergies.length || relevantRisks.length) {
      const allergyAnswer = relevantRisks.length
        ? `Atenção: eu encontrei possível relação com ${describeRisks(
            relevantRisks,
          )}. Evite se o rótulo confirmar "contém", "pode conter" ou derivados da sua alergia.`
        : buildAllergyAdvice(mentionedFood || name, mentionedAllergies, profileRisks);
      return `${ingredientAnswer}\n\n${allergyAnswer}`;
    }

    return ingredientAnswer;
  }

  if (askedAllergyAdvice) {
    if (relevantRisks.length) {
      return `${name} merece cuidado. Eu encontrei possível relação com ${describeRisks(
        relevantRisks,
      )}. Antes de comer, confira o rótulo físico e evite se aparecer "contém", "pode conter" ou derivados do ingrediente da sua alergia.`;
    }

    if (mentionedAllergies.length || mentionedFood) {
      const conclusion = hasAllergenData
        ? `Sobre ${name}: nos dados cadastrados não apareceu esse alergênico, mas isso não garante segurança — confira o rótulo físico antes de consumir.`
        : `Sobre ${name}: não consigo avaliar, porque este produto está sem lista de ingredientes e sem alergênicos cadastrados. Não dá para dizer se é seguro para você — leia o rótulo físico.`;
      return `${buildAllergyAdvice(mentionedFood || name, mentionedAllergies, profileRisks)}\n\n${conclusion}`;
    }
  }

  if (askedIngredients && mentionedFood && normalizeText(mentionedFood) !== normalizeText(name)) {
    return buildIngredientAdvice(mentionedFood);
  }

  if (askedSymptoms) {
    return `Vamos olhar isso com cuidado. Você está falando de ${name}. Me diga quais sintomas apareceram, quanto tempo depois de consumir, sua idade, alergias conhecidas e se houve falta de ar, inchaço, vômitos repetidos ou piora rápida. Enquanto isso, confira o rótulo físico e evite consumir novamente se suspeitar de reação.`;
  }

  if (askedGreeting) {
    return `Oi. Estou com ${name} aberto aqui. Pode perguntar sobre ingredientes, calorias, açúcar, sódio, proteínas ou se combina com suas alergias.`;
  }

  if (askedWellBeing) {
    return `Tudo certo. E você? Já que estamos com ${name} aberto, posso te ajudar a entender se ele é uma boa escolha, se tem muito açúcar/sódio ou se aparece algum risco para suas alergias.`;
  }

  if (askedGoodChoice) {
    const notes = [];
    if (profileRisks.length) notes.push("tem possível conflito com suas alergias");
    if (sugars !== null && sugars > 15) notes.push("tem açúcar relativamente alto por 100 g");
    if (sodium !== null && sodium > 400) notes.push("tem sódio alto por 100 g");
    if (proteins !== null && proteins >= 10) notes.push("tem boa presença de proteínas");

    if (notes.length) {
      return `${name} merece atenção porque ${notes.join(", ")}. Eu olharia a porção e conferiria o rótulo físico antes de decidir.`;
    }
    return hasAllergenData
      ? `${name} não acendeu nenhum alerta forte com os dados cadastrados. Ainda assim, vale comparar porção, ingredientes e seu objetivo do momento.`
      : `${name} está sem ingredientes e sem alergênicos cadastrados na base, então não tenho como avaliar direito. Vale conferir o rótulo físico.`;
  }

  if (askedIdentity) {
    return `Eu sou o Nutri Assistente. Agora estou usando ${name} como contexto para responder suas perguntas de um jeito mais direto.`;
  }

  if (query.includes("alerg") || query.includes("posso comer")) {
    if (relevantRisks.length) {
      return `${name} merece cuidado. Encontrei ${describeRisks(
        relevantRisks,
      )} nos ingredientes ou nos alergênicos declarados. O rótulo físico precisa ser confirmado antes de consumir; se você já consumiu e tiver falta de ar, inchaço, urticária intensa, vômitos repetidos ou tontura, procure atendimento.`;
    }
    if (!hasAllergenData) {
      return `Não consigo avaliar ${name}: este produto está sem lista de ingredientes e sem alergênicos cadastrados na base. Não dá para dizer se é seguro para você — a única fonte confiável aqui é o rótulo físico.`;
    }
    return `${name} não bateu com as alergias marcadas, mas isso não garante segurança absoluta. Confira o rótulo físico, observe traços/contaminação cruzada e evite se você já teve reação a produto parecido.`;
  }

  if (query.includes("prote")) {
    return proteins !== null
      ? `${name} tem cerca de ${formatNumber(proteins)} g de proteínas por 100 g.`
      : `Não encontrei proteína cadastrada para ${name}.`;
  }

  if (query.includes("calor") || query.includes("energia")) {
    return kcal !== null
      ? `${name} tem cerca de ${formatNumber(kcal)} kcal por 100 g.`
      : `Não encontrei calorias cadastradas para ${name}.`;
  }

  if (query.includes("sodio") || query.includes("sódio") || query.includes("sal")) {
    return sodium !== null
      ? `${name} tem cerca de ${formatNumber(sodium)} mg de sódio por 100 g. Compare esse valor com outros produtos parecidos e observe a porção que você realmente vai consumir.`
      : `Não encontrei sódio cadastrado para ${name}. Confira o rótulo físico para comparar melhor.`;
  }

  if (query.includes("acucar") || query.includes("açucar") || query.includes("açúcar")) {
    return sugars !== null
      ? `${name} tem cerca de ${formatNumber(sugars)} g de açúcares por 100 g.`
      : `Não encontrei açúcar cadastrado para ${name}.`;
  }

  if (askedHelp) {
    return `Com ${name}, eu posso te ajudar a entender ingredientes, calorias, açúcar, sódio, proteínas e alertas de alergia. Pergunte, por exemplo: "tem muito açúcar?", "quais alergênicos aparecem?" ou "esse produto é uma boa escolha?".`;
  }

  return `${name}: ${product.localInsight || "analise a tabela nutricional, os ingredientes e os alertas antes de decidir."}`;
}
