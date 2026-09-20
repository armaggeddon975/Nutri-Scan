// Catalogo de alergias e sensibilidades alimentares.
//
// Ampliado em 11/09/2026 de 19 para ~170 itens, a pedido da equipe de design:
// a FDA e a FARE citam "mais de 170 alimentos" com reacao alergica documentada,
// mas nao publicam uma lista enumerada. Este catalogo foi montado a partir das
// listas obrigatorias de rotulagem (ANVISA RDC 26/2015, Anexo II da UE, Codex
// Alimentarius, FDA/FASTER Act) e dos alergenos descritos na literatura
// clinica (AAAAI, EAACI, WHO/IUIS Allergen Nomenclature).
//
// Regras do arquivo:
// - `id` nunca muda nem e reaproveitado: perfis salvos no banco e no aparelho
//   guardam esses ids. Os 19 primeiros sao os que ja existiam.
// - `terms` em minusculas e SEM acento: o motor normaliza o texto do rotulo
//   antes de comparar. Termo curto casa palavra inteira (com plural), entao
//   "uva" nao dispara em "uva-passa"... dispara, e deve; mas "mel" nao dispara
//   em "melado" nem "coco" em "cocoa".
// - `tags` sao as tags de alergenico/traco do Open Food Facts quando existem.
// - `group` agrupa na interface; `priority: true` marca os que a lei obriga a
//   destacar no rotulo (aparecem primeiro e sao os unicos no Guia).
//
// Um mesmo ingrediente pode acender mais de um item de proposito: "castanha de
// caju" acende "Castanhas" (grupo legado) e "Castanha de caju" (especifico).
// Quem tem alergia so a caju marca o especifico; quem tem a todas marca o grupo.

export const ALLERGY_GROUPS = [
  { id: "priority", label: "Mais comuns (obrigatorios no rotulo)" },
  { id: "cereals", label: "Cereais e graos" },
  { id: "legumes", label: "Leguminosas" },
  { id: "nuts", label: "Castanhas e nozes" },
  { id: "seeds", label: "Sementes" },
  { id: "fruits", label: "Frutas" },
  { id: "vegetables", label: "Hortalicas e tuberculos" },
  { id: "fish", label: "Peixes" },
  { id: "seafood", label: "Frutos do mar" },
  { id: "meat", label: "Carnes e derivados" },
  { id: "dairy_egg", label: "Laticinios e ovos" },
  { id: "spices", label: "Ervas e especiarias" },
  { id: "additives", label: "Aditivos e corantes" },
  { id: "other", label: "Outros" },
];

export const ALLERGY_DEFINITIONS = [
  // ---------------------------------------------------------------------
  // Os 19 originais. Ordem e ids preservados.
  // ---------------------------------------------------------------------
  {
    id: "milk",
    label: "Leite/lactose",
    group: "dairy_egg",
    priority: true,
    terms: [
      "leite",
      "lactose",
      "whey",
      "caseina",
      "milk",
      "soro de leite",
      "leite em po",
      "proteina do leite",
      "derivados de leite",
      "lacteo",
      "creme de leite",
      "manteiga de leite",
      "manteiga lactea",
      "gordura anidra de leite",
    ],
    tags: ["en:milk", "en:lactose", "pt:leite", "es:leche", "fr:lait", "it:latte", "de:milch"],
  },
  {
    id: "gluten",
    label: "Gluten",
    group: "cereals",
    priority: true,
    terms: ["gluten", "trigo", "farinha de trigo", "cevada", "centeio", "aveia", "malte", "celiaco"],
    tags: [
      "en:gluten",
      "en:wheat",
      "en:barley",
      "en:rye",
      "en:oats",
      "en:spelt",
      "pt:gluten",
      "pt:trigo",
      "pt:aveia",
      "es:trigo",
      "es:avena",
      "fr:gluten",
      "fr:ble",
    ],
  },
  {
    id: "peanut",
    label: "Amendoim",
    group: "legumes",
    priority: true,
    terms: ["amendoim", "peanut"],
    tags: ["en:peanuts", "pt:amendoim", "es:cacahuetes", "fr:arachides"],
  },
  {
    id: "nuts",
    label: "Castanhas (todas)",
    group: "nuts",
    priority: true,
    terms: [
      "castanha",
      "castanha de caju",
      "castanha do para",
      "amendoa",
      "avela",
      "nozes",
      "noz",
      "pistache",
      "macadamia",
      "noz pecan",
    ],
    tags: [
      "en:nuts",
      "en:almonds",
      "en:hazelnuts",
      "en:walnuts",
      "en:cashew-nuts",
      "en:brazil-nuts",
      "en:pistachio-nuts",
      "en:macadamia-nuts",
      "pt:castanha",
      "pt:avela",
      "es:frutos-de-cascara",
      "fr:fruits-a-coque",
    ],
  },
  {
    id: "soy",
    label: "Soja",
    group: "legumes",
    priority: true,
    terms: ["soja", "soy", "lecitina de soja", "proteina de soja"],
    tags: ["en:soybeans", "pt:soja", "es:soja", "fr:soja"],
  },
  {
    id: "egg",
    label: "Ovo",
    group: "dairy_egg",
    priority: true,
    terms: ["ovo", "ovos", "clara de ovo", "gema de ovo", "albumina", "ovo em po", "egg"],
    tags: ["en:eggs", "pt:ovo", "pt:ovos", "es:huevos", "fr:oeufs"],
  },
  {
    id: "fish",
    label: "Peixe (todos)",
    group: "fish",
    priority: true,
    terms: ["peixe", "bacalhau", "atum", "sardinha", "salmao", "anchova", "fish"],
    tags: ["en:fish", "pt:peixe", "es:pescado", "fr:poissons"],
  },
  {
    id: "crustacean",
    label: "Crustaceos (todos)",
    group: "seafood",
    priority: true,
    terms: ["camarao", "caranguejo", "lagosta", "siri", "crustaceo", "crustaceos"],
    tags: ["en:crustaceans", "pt:crustaceos", "es:crustaceos", "fr:crustaces"],
  },
  {
    id: "mollusc",
    label: "Moluscos (todos)",
    group: "seafood",
    priority: true,
    terms: ["molusco", "moluscos", "mexilhao", "ostra", "lula", "polvo", "vieira"],
    tags: ["en:molluscs", "pt:moluscos", "es:moluscos", "fr:mollusques"],
  },
  {
    id: "sesame",
    label: "Gergelim",
    group: "seeds",
    priority: true,
    terms: ["gergelim", "sesamo", "tahine", "sesame"],
    tags: ["en:sesame-seeds", "pt:gergelim", "es:sesamo", "fr:sesame"],
  },
  {
    id: "mustard",
    label: "Mostarda",
    group: "seeds",
    priority: true,
    terms: ["mostarda", "mustard"],
    tags: ["en:mustard", "pt:mostarda", "es:mostaza", "fr:moutarde"],
  },
  {
    id: "sulphite",
    label: "Sulfitos",
    group: "additives",
    priority: true,
    terms: ["sulfito", "sulfitos", "dioxido de enxofre", "metabissulfito", "sulphite"],
    tags: ["en:sulphur-dioxide-and-sulphites", "pt:sulfitos", "es:sulfitos"],
  },
  {
    id: "lupin",
    label: "Tremoco",
    group: "legumes",
    priority: true,
    terms: ["tremoco", "tremocos", "lupino", "farinha de tremoco", "lupin"],
    tags: ["en:lupin", "pt:tremoco", "es:altramuces", "fr:lupin"],
  },
  {
    id: "celery",
    label: "Aipo",
    group: "vegetables",
    priority: true,
    terms: ["aipo", "salsao", "sal de aipo", "semente de aipo", "celery"],
    tags: ["en:celery", "pt:aipo", "es:apio", "fr:celeri"],
  },
  {
    id: "corn",
    label: "Milho",
    group: "cereals",
    terms: [
      "milho",
      "fuba",
      "amido de milho",
      "farinha de milho",
      "xarope de milho",
      "oleo de milho",
      "flocos de milho",
      "corn",
    ],
    tags: ["en:corn", "en:maize", "pt:milho", "es:maiz", "fr:mais"],
  },
  {
    id: "coconut",
    label: "Coco",
    group: "fruits",
    terms: ["coco", "leite de coco", "oleo de coco", "coco ralado", "agua de coco", "coconut"],
    tags: ["en:coconut", "pt:coco", "es:coco", "fr:noix-de-coco"],
  },
  {
    id: "latex",
    label: "Latex natural",
    group: "other",
    priority: true,
    terms: ["latex", "latex natural", "borracha natural"],
    tags: ["en:natural-latex", "pt:latex"],
  },
  {
    id: "tartrazine",
    label: "Tartrazina",
    group: "additives",
    priority: true,
    terms: [
      "tartrazina",
      "amarelo tartrazina",
      "corante tartrazina",
      "amarelo 5",
      "ins 102",
      "e102",
      "tartrazine",
    ],
    tags: ["en:e102", "en:tartrazine"],
  },
  {
    id: "msg",
    label: "Glutamato monossodico",
    group: "additives",
    terms: [
      "glutamato monossodico",
      "glutamato de sodio",
      "realcador de sabor glutamato",
      "ins 621",
      "e621",
      "msg",
      "monosodium glutamate",
    ],
    tags: ["en:e621", "en:monosodium-glutamate"],
  },

  // ---------------------------------------------------------------------
  // Cereais e graos
  // ---------------------------------------------------------------------
  { id: "wheat", label: "Trigo", group: "cereals", terms: ["trigo", "farinha de trigo", "semola", "semolina", "wheat"], tags: ["en:wheat", "pt:trigo"] },
  { id: "barley", label: "Cevada", group: "cereals", terms: ["cevada", "malte", "extrato de malte", "barley"], tags: ["en:barley"] },
  { id: "rye", label: "Centeio", group: "cereals", terms: ["centeio", "rye"], tags: ["en:rye"] },
  { id: "oats", label: "Aveia", group: "cereals", terms: ["aveia", "farelo de aveia", "oats", "oat"], tags: ["en:oats"] },
  { id: "spelt", label: "Espelta", group: "cereals", terms: ["espelta", "spelt"], tags: ["en:spelt"] },
  { id: "kamut", label: "Kamut (trigo khorasan)", group: "cereals", terms: ["kamut", "khorasan"], tags: ["en:kamut"] },
  { id: "buckwheat", label: "Trigo sarraceno", group: "cereals", terms: ["trigo sarraceno", "sarraceno", "buckwheat"], tags: ["en:buckwheat"] },
  { id: "rice", label: "Arroz", group: "cereals", terms: ["arroz", "farinha de arroz", "amido de arroz", "rice"], tags: ["en:rice"] },
  { id: "sorghum", label: "Sorgo", group: "cereals", terms: ["sorgo", "sorghum"], tags: ["en:sorghum"] },
  { id: "millet", label: "Painco", group: "cereals", terms: ["painco", "millet"], tags: ["en:millet"] },
  { id: "quinoa", label: "Quinoa", group: "cereals", terms: ["quinoa", "quinua"], tags: ["en:quinoa"] },
  { id: "amaranth", label: "Amaranto", group: "cereals", terms: ["amaranto", "amaranth"], tags: ["en:amaranth"] },
  { id: "teff", label: "Teff", group: "cereals", terms: ["teff"], tags: ["en:teff"] },

  // ---------------------------------------------------------------------
  // Leguminosas
  // ---------------------------------------------------------------------
  { id: "lentil", label: "Lentilha", group: "legumes", terms: ["lentilha", "lentilhas", "lentil"], tags: ["en:lentils"] },
  { id: "chickpea", label: "Grao de bico", group: "legumes", terms: ["grao de bico", "farinha de grao de bico", "chickpea", "garbanzo"], tags: ["en:chickpeas"] },
  { id: "pea", label: "Ervilha", group: "legumes", terms: ["ervilha", "ervilhas", "proteina de ervilha", "pea protein", "pea"], tags: ["en:peas"] },
  { id: "bean", label: "Feijao", group: "legumes", terms: ["feijao", "feijoes", "feijao branco", "feijao preto", "bean"], tags: ["en:beans"] },
  { id: "fava", label: "Fava", group: "legumes", terms: ["fava", "favas", "fava bean", "broad bean"], tags: ["en:broad-beans"] },
  { id: "carob", label: "Alfarroba", group: "legumes", terms: ["alfarroba", "goma de alfarroba", "carob", "locust bean gum", "e410"], tags: ["en:carob", "en:e410"] },
  { id: "fenugreek", label: "Feno-grego", group: "legumes", terms: ["feno grego", "fenogrego", "fenugreek"], tags: ["en:fenugreek"] },

  // ---------------------------------------------------------------------
  // Castanhas e nozes, uma a uma (ANVISA lista cada uma)
  // ---------------------------------------------------------------------
  { id: "almond", label: "Amendoa", group: "nuts", terms: ["amendoa", "amendoas", "farinha de amendoa", "almond"], tags: ["en:almonds"] },
  { id: "hazelnut", label: "Avela", group: "nuts", terms: ["avela", "avelas", "hazelnut"], tags: ["en:hazelnuts"] },
  { id: "cashew", label: "Castanha de caju", group: "nuts", terms: ["castanha de caju", "caju", "cashew"], tags: ["en:cashew-nuts"] },
  { id: "brazil_nut", label: "Castanha do para", group: "nuts", terms: ["castanha do para", "castanha do brasil", "brazil nut"], tags: ["en:brazil-nuts"] },
  { id: "walnut", label: "Nozes", group: "nuts", terms: ["noz", "nozes", "walnut"], tags: ["en:walnuts"] },
  { id: "pecan", label: "Noz-peca", group: "nuts", terms: ["noz pecan", "noz peca", "pecan"], tags: ["en:pecan-nuts"] },
  { id: "pistachio", label: "Pistache", group: "nuts", terms: ["pistache", "pistachio"], tags: ["en:pistachio-nuts"] },
  { id: "macadamia", label: "Macadamia", group: "nuts", terms: ["macadamia"], tags: ["en:macadamia-nuts"] },
  { id: "pine_nut", label: "Pinoli", group: "nuts", terms: ["pinoli", "pinhao", "pine nut"], tags: ["en:pine-nuts"] },
  { id: "chestnut", label: "Castanha portuguesa", group: "nuts", terms: ["castanha portuguesa", "chestnut"], tags: ["en:chestnuts"] },

  // ---------------------------------------------------------------------
  // Sementes
  // ---------------------------------------------------------------------
  { id: "sunflower", label: "Girassol", group: "seeds", terms: ["girassol", "semente de girassol", "oleo de girassol", "sunflower"], tags: ["en:sunflower-seeds"] },
  { id: "poppy", label: "Papoula", group: "seeds", terms: ["papoula", "semente de papoula", "poppy seed"], tags: ["en:poppy-seeds"] },
  { id: "flax", label: "Linhaca", group: "seeds", terms: ["linhaca", "semente de linhaca", "flaxseed", "linseed"], tags: ["en:flax-seeds"] },
  { id: "chia", label: "Chia", group: "seeds", terms: ["chia", "semente de chia"], tags: ["en:chia-seeds"] },
  { id: "pumpkin_seed", label: "Semente de abobora", group: "seeds", terms: ["semente de abobora", "sementes de abobora", "pumpkin seed"], tags: ["en:pumpkin-seeds"] },
  { id: "cottonseed", label: "Semente de algodao", group: "seeds", terms: ["semente de algodao", "oleo de algodao", "cottonseed"], tags: ["en:cottonseed"] },

  // ---------------------------------------------------------------------
  // Frutas
  // ---------------------------------------------------------------------
  { id: "banana", label: "Banana", group: "fruits", terms: ["banana", "bananas"], tags: ["en:banana"] },
  { id: "kiwi", label: "Kiwi", group: "fruits", terms: ["kiwi"], tags: ["en:kiwi"] },
  { id: "avocado", label: "Abacate", group: "fruits", terms: ["abacate", "avocado", "guacamole"], tags: ["en:avocado"] },
  { id: "apple", label: "Maca", group: "fruits", terms: ["maca", "macas", "suco de maca", "apple"], tags: ["en:apple"] },
  { id: "peach", label: "Pessego", group: "fruits", terms: ["pessego", "pessegos", "peach"], tags: ["en:peach"] },
  { id: "apricot", label: "Damasco", group: "fruits", terms: ["damasco", "damascos", "apricot"], tags: ["en:apricot"] },
  { id: "plum", label: "Ameixa", group: "fruits", terms: ["ameixa", "ameixas", "plum", "prune"], tags: ["en:plum"] },
  { id: "cherry", label: "Cereja", group: "fruits", terms: ["cereja", "cerejas", "cherry"], tags: ["en:cherry"] },
  { id: "pear", label: "Pera", group: "fruits", terms: ["pera", "peras", "pear"], tags: ["en:pear"] },
  { id: "strawberry", label: "Morango", group: "fruits", terms: ["morango", "morangos", "strawberry"], tags: ["en:strawberry"] },
  { id: "raspberry", label: "Framboesa", group: "fruits", terms: ["framboesa", "framboesas", "raspberry"], tags: ["en:raspberry"] },
  { id: "blackberry", label: "Amora", group: "fruits", terms: ["amora", "amoras", "blackberry"], tags: ["en:blackberry"] },
  { id: "blueberry", label: "Mirtilo", group: "fruits", terms: ["mirtilo", "mirtilos", "blueberry"], tags: ["en:blueberry"] },
  { id: "grape", label: "Uva", group: "fruits", terms: ["uva", "uvas", "uva passa", "suco de uva", "grape", "raisin"], tags: ["en:grape"] },
  { id: "fig", label: "Figo", group: "fruits", terms: ["figo", "figos", "fig"], tags: ["en:fig"] },
  { id: "orange", label: "Laranja", group: "fruits", terms: ["laranja", "laranjas", "suco de laranja", "orange"], tags: ["en:orange"] },
  { id: "tangerine", label: "Tangerina", group: "fruits", terms: ["tangerina", "mexerica", "bergamota", "tangerine", "mandarin"], tags: ["en:mandarin"] },
  { id: "lemon", label: "Limao", group: "fruits", terms: ["limao", "limoes", "lime", "lemon"], tags: ["en:lemon"] },
  { id: "mango", label: "Manga", group: "fruits", terms: ["manga", "mangas", "mango"], tags: ["en:mango"] },
  { id: "pineapple", label: "Abacaxi", group: "fruits", terms: ["abacaxi", "pineapple", "bromelina"], tags: ["en:pineapple"] },
  { id: "papaya", label: "Mamao", group: "fruits", terms: ["mamao", "papaia", "papaya", "papaina"], tags: ["en:papaya"] },
  { id: "melon", label: "Melao", group: "fruits", terms: ["melao", "meloes", "melon"], tags: ["en:melon"] },
  { id: "watermelon", label: "Melancia", group: "fruits", terms: ["melancia", "watermelon"], tags: ["en:watermelon"] },
  { id: "passion_fruit", label: "Maracuja", group: "fruits", terms: ["maracuja", "passion fruit"], tags: ["en:passion-fruit"] },
  { id: "guava", label: "Goiaba", group: "fruits", terms: ["goiaba", "goiabada", "guava"], tags: ["en:guava"] },
  { id: "acai", label: "Acai", group: "fruits", terms: ["acai"], tags: ["en:acai"] },
  { id: "jackfruit", label: "Jaca", group: "fruits", terms: ["jaca", "jackfruit"], tags: ["en:jackfruit"] },
  { id: "lychee", label: "Lichia", group: "fruits", terms: ["lichia", "lychee", "litchi"], tags: ["en:lychee"] },
  { id: "persimmon", label: "Caqui", group: "fruits", terms: ["caqui", "persimmon"], tags: ["en:persimmon"] },
  { id: "pomegranate", label: "Roma", group: "fruits", terms: ["roma", "pomegranate"], tags: ["en:pomegranate"] },
  { id: "date", label: "Tamara", group: "fruits", terms: ["tamara", "tamaras", "dates"], tags: ["en:date"] },
  { id: "carambola", label: "Carambola", group: "fruits", terms: ["carambola", "star fruit"], tags: ["en:carambola"] },
  { id: "cranberry", label: "Cranberry", group: "fruits", terms: ["cranberry", "oxicoco"], tags: ["en:cranberry"] },

  // ---------------------------------------------------------------------
  // Hortalicas e tuberculos
  // ---------------------------------------------------------------------
  { id: "tomato", label: "Tomate", group: "vegetables", terms: ["tomate", "tomates", "molho de tomate", "extrato de tomate", "ketchup", "tomato"], tags: ["en:tomato"] },
  { id: "carrot", label: "Cenoura", group: "vegetables", terms: ["cenoura", "cenouras", "carrot"], tags: ["en:carrot"] },
  { id: "garlic", label: "Alho", group: "vegetables", terms: ["alho", "alho em po", "garlic"], tags: ["en:garlic"] },
  { id: "onion", label: "Cebola", group: "vegetables", terms: ["cebola", "cebolas", "cebola em po", "onion"], tags: ["en:onion"] },
  { id: "leek", label: "Alho-poro", group: "vegetables", terms: ["alho poro", "leek"], tags: ["en:leek"] },
  { id: "potato", label: "Batata", group: "vegetables", terms: ["batata", "batatas", "fecula de batata", "amido de batata", "potato"], tags: ["en:potato"] },
  { id: "sweet_potato", label: "Batata-doce", group: "vegetables", terms: ["batata doce", "sweet potato"], tags: ["en:sweet-potato"] },
  { id: "cassava", label: "Mandioca", group: "vegetables", terms: ["mandioca", "aipim", "macaxeira", "fecula de mandioca", "polvilho", "tapioca", "cassava"], tags: ["en:cassava", "en:tapioca"] },
  { id: "yam", label: "Inhame", group: "vegetables", terms: ["inhame", "yam"], tags: ["en:yam"] },
  { id: "bell_pepper", label: "Pimentao", group: "vegetables", terms: ["pimentao", "pimentoes", "bell pepper"], tags: ["en:bell-pepper"] },
  { id: "chili", label: "Pimenta (capsicum)", group: "vegetables", terms: ["pimenta vermelha", "pimenta malagueta", "pimenta dedo de moca", "pimenta calabresa", "chili", "capsicum"], tags: ["en:chili-pepper"] },
  { id: "eggplant", label: "Berinjela", group: "vegetables", terms: ["berinjela", "eggplant", "aubergine"], tags: ["en:eggplant"] },
  { id: "zucchini", label: "Abobrinha", group: "vegetables", terms: ["abobrinha", "zucchini", "courgette"], tags: ["en:zucchini"] },
  { id: "pumpkin", label: "Abobora", group: "vegetables", terms: ["abobora", "moranga", "pumpkin", "squash"], tags: ["en:pumpkin"] },
  { id: "cucumber", label: "Pepino", group: "vegetables", terms: ["pepino", "pepinos", "cucumber"], tags: ["en:cucumber"] },
  { id: "spinach", label: "Espinafre", group: "vegetables", terms: ["espinafre", "spinach"], tags: ["en:spinach"] },
  { id: "lettuce", label: "Alface", group: "vegetables", terms: ["alface", "lettuce"], tags: ["en:lettuce"] },
  { id: "cabbage", label: "Repolho e couve", group: "vegetables", terms: ["repolho", "couve", "couve flor", "brocolis", "couve de bruxelas", "cabbage", "kale", "broccoli", "cauliflower"], tags: ["en:cabbage", "en:kale", "en:broccoli", "en:cauliflower"] },
  { id: "asparagus", label: "Aspargo", group: "vegetables", terms: ["aspargo", "aspargos", "asparagus"], tags: ["en:asparagus"] },
  { id: "artichoke", label: "Alcachofra", group: "vegetables", terms: ["alcachofra", "artichoke"], tags: ["en:artichoke"] },
  { id: "beetroot", label: "Beterraba", group: "vegetables", terms: ["beterraba", "beetroot", "beet"], tags: ["en:beetroot"] },
  { id: "turnip", label: "Nabo e rabanete", group: "vegetables", terms: ["nabo", "rabanete", "turnip", "radish"], tags: ["en:turnip", "en:radish"] },
  { id: "okra", label: "Quiabo", group: "vegetables", terms: ["quiabo", "okra"], tags: ["en:okra"] },
  { id: "chayote", label: "Chuchu", group: "vegetables", terms: ["chuchu", "chayote"], tags: ["en:chayote"] },
  { id: "palm_heart", label: "Palmito", group: "vegetables", terms: ["palmito", "pupunha", "heart of palm"], tags: ["en:palm-heart"] },
  { id: "mushroom", label: "Cogumelo", group: "vegetables", terms: ["cogumelo", "cogumelos", "champignon", "shiitake", "shimeji", "mushroom"], tags: ["en:mushrooms"] },
  { id: "fennel", label: "Funcho e erva-doce", group: "vegetables", terms: ["funcho", "erva doce", "fennel"], tags: ["en:fennel"] },
  { id: "parsley", label: "Salsa", group: "vegetables", terms: ["salsa", "salsinha", "parsley"], tags: ["en:parsley"] },
  { id: "seaweed", label: "Algas", group: "vegetables", terms: ["alga", "algas", "nori", "wakame", "kombu", "agar", "seaweed"], tags: ["en:seaweed", "en:agar-agar"] },

  // ---------------------------------------------------------------------
  // Peixes por especie
  // ---------------------------------------------------------------------
  { id: "cod", label: "Bacalhau", group: "fish", terms: ["bacalhau", "cod"], tags: ["en:cod"] },
  { id: "tuna", label: "Atum", group: "fish", terms: ["atum", "tuna"], tags: ["en:tuna"] },
  { id: "salmon", label: "Salmao", group: "fish", terms: ["salmao", "salmon"], tags: ["en:salmon"] },
  { id: "sardine", label: "Sardinha", group: "fish", terms: ["sardinha", "sardinhas", "sardine"], tags: ["en:sardine"] },
  { id: "anchovy", label: "Anchova", group: "fish", terms: ["anchova", "aliche", "anchovy"], tags: ["en:anchovy"] },
  { id: "tilapia", label: "Tilapia", group: "fish", terms: ["tilapia"], tags: ["en:tilapia"] },
  { id: "hake", label: "Merluza e pescada", group: "fish", terms: ["merluza", "pescada", "hake"], tags: ["en:hake"] },
  { id: "trout", label: "Truta", group: "fish", terms: ["truta", "trout"], tags: ["en:trout"] },
  { id: "sole", label: "Linguado", group: "fish", terms: ["linguado", "sole"], tags: ["en:sole"] },
  { id: "mackerel", label: "Cavala", group: "fish", terms: ["cavala", "cavalinha", "mackerel"], tags: ["en:mackerel"] },
  { id: "herring", label: "Arenque", group: "fish", terms: ["arenque", "herring"], tags: ["en:herring"] },
  { id: "surimi", label: "Surimi (kani)", group: "fish", terms: ["surimi", "kani", "kani kama"], tags: ["en:surimi"] },
  { id: "fish_roe", label: "Ovas de peixe", group: "fish", terms: ["ovas", "caviar", "ikura", "masago", "tobiko", "roe"], tags: ["en:fish-roe"] },

  // ---------------------------------------------------------------------
  // Frutos do mar por tipo
  // ---------------------------------------------------------------------
  { id: "shrimp", label: "Camarao", group: "seafood", terms: ["camarao", "camaroes", "shrimp", "prawn"], tags: ["en:shrimp"] },
  { id: "crab", label: "Caranguejo e siri", group: "seafood", terms: ["caranguejo", "siri", "crab"], tags: ["en:crab"] },
  { id: "lobster", label: "Lagosta", group: "seafood", terms: ["lagosta", "lagostim", "lobster", "crayfish"], tags: ["en:lobster"] },
  { id: "squid", label: "Lula", group: "seafood", terms: ["lula", "lulas", "calamar", "squid"], tags: ["en:squid"] },
  { id: "octopus", label: "Polvo", group: "seafood", terms: ["polvo", "octopus"], tags: ["en:octopus"] },
  { id: "oyster", label: "Ostra", group: "seafood", terms: ["ostra", "ostras", "molho de ostra", "oyster"], tags: ["en:oyster"] },
  { id: "mussel", label: "Mexilhao", group: "seafood", terms: ["mexilhao", "marisco", "mussel"], tags: ["en:mussel"] },
  { id: "clam", label: "Ameijoa e vongole", group: "seafood", terms: ["ameijoa", "vongole", "berbigao", "clam"], tags: ["en:clam"] },
  { id: "scallop", label: "Vieira", group: "seafood", terms: ["vieira", "scallop"], tags: ["en:scallop"] },
  { id: "snail", label: "Escargot e caramujo", group: "seafood", terms: ["escargot", "caramujo", "snail"], tags: ["en:snail"] },

  // ---------------------------------------------------------------------
  // Carnes e derivados
  // ---------------------------------------------------------------------
  { id: "beef", label: "Carne bovina", group: "meat", terms: ["carne bovina", "carne de boi", "boi", "bife", "carne moida", "beef"], tags: ["en:beef"] },
  { id: "pork", label: "Carne suina", group: "meat", terms: ["carne suina", "porco", "suino", "suina", "bacon", "presunto", "toucinho", "banha", "pernil", "pork"], tags: ["en:pork"] },
  { id: "chicken", label: "Frango", group: "meat", terms: ["frango", "galinha", "carne de frango", "chicken"], tags: ["en:chicken"] },
  { id: "turkey", label: "Peru", group: "meat", terms: ["peru", "carne de peru", "peito de peru", "turkey"], tags: ["en:turkey"] },
  { id: "lamb", label: "Cordeiro e carneiro", group: "meat", terms: ["cordeiro", "carneiro", "carne de cordeiro", "lamb", "mutton"], tags: ["en:lamb"] },
  { id: "gelatin", label: "Gelatina e colageno", group: "meat", terms: ["gelatina", "colageno", "gelatin", "collagen"], tags: ["en:gelatin"] },

  // ---------------------------------------------------------------------
  // Laticinios e ovos (alem de leite e ovo)
  // ---------------------------------------------------------------------
  { id: "goat_milk", label: "Leite de cabra e ovelha", group: "dairy_egg", terms: ["leite de cabra", "leite de ovelha", "queijo de cabra", "goat milk", "sheep milk"], tags: ["en:goat-milk", "en:sheep-milk"] },
  { id: "casein", label: "Caseina", group: "dairy_egg", terms: ["caseina", "caseinato", "casein", "caseinate"], tags: ["en:casein"] },
  { id: "whey", label: "Soro do leite (whey)", group: "dairy_egg", terms: ["whey", "soro de leite", "soro do leite", "proteina do soro"], tags: ["en:whey"] },
  { id: "egg_white", label: "Clara de ovo (albumina)", group: "dairy_egg", terms: ["clara de ovo", "albumina", "ovoalbumina", "egg white"], tags: ["en:egg-white"] },
  { id: "egg_yolk", label: "Gema de ovo", group: "dairy_egg", terms: ["gema de ovo", "gema", "egg yolk"], tags: ["en:egg-yolk"] },

  // ---------------------------------------------------------------------
  // Ervas e especiarias
  // ---------------------------------------------------------------------
  { id: "cinnamon", label: "Canela", group: "spices", terms: ["canela", "cinnamon"], tags: ["en:cinnamon"] },
  { id: "coriander", label: "Coentro", group: "spices", terms: ["coentro", "coriander", "cilantro"], tags: ["en:coriander"] },
  { id: "cumin", label: "Cominho", group: "spices", terms: ["cominho", "cumin"], tags: ["en:cumin"] },
  { id: "anise", label: "Anis", group: "spices", terms: ["anis", "anis estrelado", "anise", "star anise"], tags: ["en:anise"] },
  { id: "paprika", label: "Paprica", group: "spices", terms: ["paprica", "paprika", "pimentao em po"], tags: ["en:paprika"] },
  { id: "black_pepper", label: "Pimenta-do-reino", group: "spices", terms: ["pimenta do reino", "pimenta preta", "pimenta branca", "black pepper"], tags: ["en:black-pepper"] },
  { id: "saffron", label: "Acafrao", group: "spices", terms: ["acafrao", "curcuma", "saffron", "turmeric"], tags: ["en:saffron", "en:turmeric"] },
  { id: "ginger", label: "Gengibre", group: "spices", terms: ["gengibre", "ginger"], tags: ["en:ginger"] },
  { id: "clove", label: "Cravo-da-india", group: "spices", terms: ["cravo", "cravo da india", "clove"], tags: ["en:clove"] },
  { id: "nutmeg", label: "Noz-moscada", group: "spices", terms: ["noz moscada", "nutmeg"], tags: ["en:nutmeg"] },
  { id: "vanilla", label: "Baunilha", group: "spices", terms: ["baunilha", "vanilla", "vanilina"], tags: ["en:vanilla"] },
  { id: "oregano", label: "Oregano", group: "spices", terms: ["oregano"], tags: ["en:oregano"] },
  { id: "basil", label: "Manjericao", group: "spices", terms: ["manjericao", "basil"], tags: ["en:basil"] },
  { id: "mint", label: "Menta e hortela", group: "spices", terms: ["menta", "hortela", "mentol", "mint", "peppermint"], tags: ["en:mint"] },
  { id: "chamomile", label: "Camomila", group: "spices", terms: ["camomila", "chamomile"], tags: ["en:chamomile"] },
  { id: "thyme", label: "Tomilho", group: "spices", terms: ["tomilho", "thyme"], tags: ["en:thyme"] },
  { id: "rosemary", label: "Alecrim", group: "spices", terms: ["alecrim", "rosemary"], tags: ["en:rosemary"] },
  { id: "bay_leaf", label: "Louro", group: "spices", terms: ["louro", "folha de louro", "bay leaf"], tags: ["en:bay-leaf"] },
  { id: "cardamom", label: "Cardamomo", group: "spices", terms: ["cardamomo", "cardamom"], tags: ["en:cardamom"] },
  { id: "dill", label: "Endro (dill)", group: "spices", terms: ["endro", "dill"], tags: ["en:dill"] },

  // ---------------------------------------------------------------------
  // Aditivos e corantes (alem de sulfitos, tartrazina e glutamato)
  // ---------------------------------------------------------------------
  { id: "carmine", label: "Carmim / cochonilha (INS 120)", group: "additives", terms: ["carmim", "cochonilha", "acido carminico", "ins 120", "e120", "carmine"], tags: ["en:e120"] },
  { id: "annatto", label: "Urucum (INS 160b)", group: "additives", terms: ["urucum", "bixina", "norbixina", "ins 160b", "e160b", "annatto"], tags: ["en:e160b"] },
  { id: "sunset_yellow", label: "Amarelo crepusculo (INS 110)", group: "additives", terms: ["amarelo crepusculo", "amarelo 6", "ins 110", "e110", "sunset yellow"], tags: ["en:e110"] },
  { id: "allura_red", label: "Vermelho 40 (INS 129)", group: "additives", terms: ["vermelho 40", "vermelho allura", "ins 129", "e129", "allura red"], tags: ["en:e129"] },
  { id: "benzoate", label: "Benzoatos (INS 210-213)", group: "additives", terms: ["benzoato de sodio", "acido benzoico", "benzoato", "ins 211", "e211", "e210", "e212", "e213", "benzoate"], tags: ["en:e211", "en:e210"] },
  { id: "nitrite", label: "Nitritos e nitratos (INS 249-252)", group: "additives", terms: ["nitrito", "nitrato", "nitrito de sodio", "ins 250", "e250", "e249", "e251", "e252"], tags: ["en:e250", "en:e251"] },
  { id: "aspartame", label: "Aspartame (INS 951)", group: "additives", terms: ["aspartame", "ins 951", "e951", "fenilalanina"], tags: ["en:e951"] },
  { id: "carrageenan", label: "Carragena (INS 407)", group: "additives", terms: ["carragena", "carragenina", "ins 407", "e407", "carrageenan"], tags: ["en:e407"] },
  { id: "guar_gum", label: "Goma guar (INS 412)", group: "additives", terms: ["goma guar", "ins 412", "e412", "guar gum"], tags: ["en:e412"] },
  { id: "bha_bht", label: "BHA / BHT (INS 320-321)", group: "additives", terms: ["bha", "bht", "ins 320", "ins 321", "e320", "e321"], tags: ["en:e320", "en:e321"] },
  { id: "propylene_glycol", label: "Propilenoglicol (INS 1520)", group: "additives", terms: ["propilenoglicol", "propileno glicol", "ins 1520", "e1520", "propylene glycol"], tags: ["en:e1520"] },
  { id: "sorbate", label: "Sorbatos (INS 200-203)", group: "additives", terms: ["sorbato de potassio", "acido sorbico", "sorbato", "ins 202", "e200", "e202", "e203", "sorbate"], tags: ["en:e202", "en:e200"] },

  // ---------------------------------------------------------------------
  // Outros
  // ---------------------------------------------------------------------
  { id: "cocoa", label: "Cacau e chocolate", group: "other", terms: ["cacau", "chocolate", "cocoa", "manteiga de cacau"], tags: ["en:cocoa"] },
  { id: "coffee", label: "Cafe", group: "other", terms: ["cafe", "coffee"], tags: ["en:coffee"] },
  { id: "honey", label: "Mel e derivados de abelha", group: "other", terms: ["mel", "propolis", "geleia real", "polen", "honey", "bee pollen"], tags: ["en:honey"] },
  { id: "yeast", label: "Levedura / fermento biologico", group: "other", terms: ["levedura", "fermento biologico", "extrato de levedura", "yeast"], tags: ["en:yeast"] },
  { id: "insects", label: "Insetos (farinha de grilo)", group: "other", terms: ["grilo", "farinha de grilo", "inseto", "insetos", "larva", "tenebrio", "cricket", "insect"], tags: ["en:insects"] },
  { id: "hops", label: "Lupulo", group: "other", terms: ["lupulo", "hops"], tags: ["en:hops"] },
  { id: "tea", label: "Cha (camellia sinensis)", group: "other", terms: ["cha preto", "cha verde", "cha branco", "matcha", "camellia sinensis", "black tea", "green tea"], tags: ["en:tea"] },
  { id: "mate", label: "Erva-mate", group: "other", terms: ["erva mate", "mate", "chimarrao", "terere", "yerba mate"], tags: ["en:yerba-mate"] },
  { id: "guarana", label: "Guarana", group: "other", terms: ["guarana"], tags: ["en:guarana"] },
  { id: "spirulina", label: "Spirulina e clorela", group: "other", terms: ["spirulina", "espirulina", "clorela", "chlorella"], tags: ["en:spirulina"] },
  { id: "aloe", label: "Aloe vera (babosa)", group: "other", terms: ["aloe vera", "babosa", "aloe"], tags: ["en:aloe-vera"] },
  { id: "stevia", label: "Estevia", group: "other", terms: ["estevia", "stevia", "glicosideos de esteviol", "e960"], tags: ["en:e960"] },
  { id: "alcohol", label: "Alcool etilico", group: "other", terms: ["alcool", "etanol", "alcool etilico", "ethanol", "alcohol"], tags: ["en:alcohol"] },
  { id: "nickel", label: "Niquel (alimentos ricos)", group: "other", terms: ["niquel", "nickel"], tags: [] },
];

export const ALLERGY_IDS = ALLERGY_DEFINITIONS.map((option) => option.id);
export const VALID_ALLERGY_IDS = new Set(ALLERGY_IDS);
export const DEFAULT_ALLERGIES = [];

// Os que a lei obriga a destacar no rotulo. Sao os que aparecem no Guia de
// rotulos e no topo do seletor; o resto do catalogo fica atras da busca.
export const PRIORITY_ALLERGY_OPTIONS = ALLERGY_DEFINITIONS.filter((option) => option.priority);

export function isValidAllergyId(id) {
  return VALID_ALLERGY_IDS.has(id);
}

export function filterValidAllergies(allergies) {
  return [...new Set(Array.isArray(allergies) ? allergies : [])].filter(isValidAllergyId);
}
