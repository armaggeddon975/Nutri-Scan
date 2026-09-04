import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  Camera,
  ClipboardList,
  Home,
  LogIn,
  Search,
  ShieldAlert,
  User,
} from "lucide-react";

import { DEFAULT_ALLERGIES } from "./data/allergens";
import { ProductAnalysis } from "./components/food/ProductAnalysis";
import { NavRail } from "./components/navigation/NavRail";
import { TabBar } from "./components/navigation/TabBar";
import { TopBar } from "./components/navigation/TopBar";
import { HomePage } from "./pages/Home/HomePage";
import { SearchPage } from "./pages/Search/SearchPage";
import { ScannerPage } from "./pages/Scanner/ScannerPage";
import { AllergiesPage } from "./pages/Allergies/AllergiesPage";
import { AssistantPage } from "./pages/Assistant/AssistantPage";
import { AccountPage } from "./pages/Account/AccountPage";
import { GuidePage } from "./pages/Guide/GuidePage";
import { askAiAssistant } from "./services/aiAssistantService";
import { decideAssistantFallback, resolveAssistantSuccess } from "./services/assistantFallback";
import { buildAllergyVerdict } from "../shared/allergyVerdict.js";
import { buildAssistantAnswer } from "./services/assistantService";
import { getMe, loginAccount, logoutAccount, registerAccount } from "./services/authService";
import { findLocalFoods } from "./services/foodService";
import { fetchProductByBarcode, searchProductsByName } from "./services/openFoodFactsService";
import { updateProfileAllergies } from "./services/profileService";
import { describeCameraError, loadScannerLib } from "./services/scannerService";
import {
  readStoredAllergies,
  readStoredUsers,
  writeStoredAllergies,
} from "./services/storageService";
import { scanAllergies } from "./utils/allergens";
import { shouldApplyAllergySaveResult } from "./utils/allergySaveQueue";
import { getNutrientRows, getNutritionScore } from "./utils/nutrition";
import { getProductName } from "./utils/product";
import { cleanBarcode, isBarcodeQuery, normalizeText } from "./utils/text";
import { hashPassword, hasSecureCrypto, legacyHashPassword } from "./utils/security";

const VALID_PAGES = ["home", "consulta", "scan", "alergias", "chat", "guia", "conta"];

function getPublicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    allergies: user.allergies || [],
    createdAt: user.createdAt,
  };
}

function findUserByIdentifier(users, identifier) {
  const normalizedIdentifier = normalizeText(identifier);
  return users.find(
    (user) =>
      normalizeText(user.email) === normalizedIdentifier ||
      normalizeText(user.name) === normalizedIdentifier,
  );
}

async function verifyLegacyUserPassword(user, password) {
  if (!hasSecureCrypto()) return false;

  if (user?.passwordSalt) {
    const { hash } = await hashPassword(password, user.passwordSalt);
    return hash === user.passwordHash;
  }

  if (user) {
    return (await legacyHashPassword(password)) === user.passwordHash;
  }

  return false;
}

async function migrateLegacyAccount(identifier, password) {
  const storedUsers = readStoredUsers();
  const legacyUser =
    storedUsers.find((user) => normalizeText(user.email) === normalizeText(identifier)) ||
    findUserByIdentifier(storedUsers, identifier);

  if (!legacyUser) return null;
  const passwordMatches = await verifyLegacyUserPassword(legacyUser, password);
  if (!passwordMatches) return null;

  return registerAccount({
    name: legacyUser.name,
    email: legacyUser.email,
    password,
    allergies: Array.isArray(legacyUser.allergies) ? legacyUser.allergies : [],
  });
}

function getInitialAllergies() {
  return readStoredAllergies();
}

function App() {
  const videoRef = useRef(null);
  const chatLogRef = useRef(null);
  const scanControlsRef = useRef(null);
  const lastDetectedRef = useRef("");
  const lastAssistantQuestionRef = useRef("");
  const searchTokenRef = useRef(0);
  const scannerRunIdRef = useRef(0);
  const allergySaveQueueRef = useRef(Promise.resolve());
  const allergySaveVersionRef = useRef(0);

  const [activePage, setActivePage] = useState("home");
  const [query, setQuery] = useState("");
  const [product, setProduct] = useState(null);
  const [localMatches, setLocalMatches] = useState([]);
  const [scannerState, setScannerState] = useState("idle");
  const [currentUser, setCurrentUser] = useState(null);
  const [selectedAllergies, setSelectedAllergies] = useState(() => getInitialAllergies());
  const selectedAllergiesRef = useRef(selectedAllergies);
  const confirmedAllergiesRef = useRef(selectedAllergies);
  const currentUserRef = useRef(null);
  const [authMode, setAuthMode] = useState("login");
  const [authForm, setAuthForm] = useState({ name: "", email: "", password: "" });
  const [authStatus, setAuthStatus] = useState({
    type: "ready",
    message: "Entre ou crie uma conta para salvar suas alergias.",
  });
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [assistantConnection, setAssistantConnection] = useState({
    type: "ready",
    message: "Pronto para conversar.",
  });
  const [assistantQuestion, setAssistantQuestion] = useState("");
  const [assistantMessages, setAssistantMessages] = useState([
    {
      role: "assistant",
      text: "Oi, eu sou o Nutri Assistente. Pode conversar comigo normalmente. Eu consigo falar sobre alimentos, rótulos, alergias, sintomas leves e também te ajudar a entender o produto que você escanear.",
    },
  ]);
  const [status, setStatus] = useState({
    type: "ready",
    message: "Busque por alimento, digite um código ou ligue a câmera.",
  });

  const restoreGuestSession = useCallback((message, type = "ready") => {
    const guestAllergies = readStoredAllergies();
    currentUserRef.current = null;
    selectedAllergiesRef.current = guestAllergies;
    confirmedAllergiesRef.current = guestAllergies;
    setCurrentUser(null);
    setSelectedAllergies(guestAllergies);
    setAuthStatus({ type, message });
  }, []);

  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  useEffect(() => {
    selectedAllergiesRef.current = selectedAllergies;
  }, [selectedAllergies]);

  useEffect(() => {
    let active = true;

    getMe()
      .then(({ user }) => {
        if (!active) return;
        const serverAllergies = Array.isArray(user?.allergies) ? user.allergies : DEFAULT_ALLERGIES;
        const publicUser = getPublicUser(user);
        currentUserRef.current = publicUser;
        setCurrentUser(publicUser);
        setSelectedAllergies(serverAllergies);
        selectedAllergiesRef.current = serverAllergies;
        confirmedAllergiesRef.current = serverAllergies;
        setAuthStatus({
          type: "success",
          message: `Sessão recuperada, ${user.name}.`,
        });
      })
      .catch((error) => {
        if (!active) return;
        restoreGuestSession(
          error.status === 401
            ? "Entre ou crie uma conta para salvar suas alergias."
            : "Recursos de conta estão temporariamente indisponíveis. O modo visitante continua funcionando.",
          error.status === 401 ? "ready" : "warning",
        );
      });

    return () => {
      active = false;
    };
  }, [restoreGuestSession]);

  const nutrientRows = useMemo(() => getNutrientRows(product?.nutriments), [product]);
  const allergyScan = useMemo(
    () => scanAllergies(product, selectedAllergies),
    [product, selectedAllergies],
  );
  const productScore = useMemo(
    () => getNutritionScore(product, allergyScan.profileRisks),
    [product, allergyScan.profileRisks],
  );

  const stopScanner = useCallback(() => {
    scannerRunIdRef.current += 1;
    scanControlsRef.current?.stop();
    scanControlsRef.current = null;
    lastDetectedRef.current = "";
    setScannerState("idle");
  }, []);

  useEffect(() => {
    const syncPageWithHash = () => {
      const pageFromHash = window.location.hash.replace("#", "");
      if (VALID_PAGES.includes(pageFromHash)) {
        setActivePage(pageFromHash);
      }
    };

    syncPageWithHash();
    window.addEventListener("hashchange", syncPageWithHash);
    window.addEventListener("popstate", syncPageWithHash);
    return () => {
      window.removeEventListener("hashchange", syncPageWithHash);
      window.removeEventListener("popstate", syncPageWithHash);
    };
  }, []);

  useEffect(() => {
    if (activePage !== "scan") stopScanner();
    return () => stopScanner();
  }, [activePage, stopScanner]);

  useEffect(() => {
    const stopWhenHidden = () => {
      if (document.hidden) stopScanner();
    };
    document.addEventListener("visibilitychange", stopWhenHidden);
    return () => document.removeEventListener("visibilitychange", stopWhenHidden);
  }, [stopScanner]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [activePage]);

  useEffect(() => {
    chatLogRef.current?.scrollTo({
      top: chatLogRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [assistantMessages, assistantLoading]);

  const selectProduct = useCallback((nextProduct) => {
    setProduct(nextProduct);
    setQuery(nextProduct.isLocal ? getProductName(nextProduct) : nextProduct.code || "");
    setStatus({
      type: "success",
      message: `${getProductName(nextProduct)} carregado.`,
    });
  }, []);

  const searchProduct = useCallback(
    async (rawQuery) => {
      const nextQuery = rawQuery.trim();
      if (!nextQuery) {
        setStatus({ type: "warning", message: "Digite um alimento ou código de barras." });
        return;
      }

      const token = ++searchTokenRef.current;
      setQuery(nextQuery);
      setProduct(null);
      setLocalMatches([]);

      if (!isBarcodeQuery(nextQuery)) {
        const matches = findLocalFoods(nextQuery);
        if (matches.length) {
          if (token !== searchTokenRef.current) return;
          setLocalMatches(matches);
          selectProduct(matches[0]);
          setStatus({
            type: "success",
            message: `${matches.length} resultado(s) na base local brasileira.`,
          });
          return;
        }

        setStatus({ type: "loading", message: `Procurando "${nextQuery}"...` });

        try {
          const remoteMatches = await searchProductsByName(nextQuery);
          if (token !== searchTokenRef.current) return;

          if (!remoteMatches.length) {
            setStatus({
              type: "warning",
              message: `Não encontrei "${nextQuery}". Tente outro nome ou use o código de barras.`,
            });
            return;
          }

          setLocalMatches(remoteMatches);
          selectProduct(remoteMatches[0]);
          setStatus({
            type: "success",
            message: `${remoteMatches.length} resultado(s) na Open Food Facts.`,
          });
        } catch {
          if (token !== searchTokenRef.current) return;
          setStatus({
            type: "warning",
            message:
              "A busca por nome está indisponível no momento. Use o código de barras ou um dos exemplos.",
          });
        }
        return;
      }

      const barcode = cleanBarcode(nextQuery);
      setStatus({ type: "loading", message: `Buscando produto ${barcode}...` });

      try {
        const foundProduct = await fetchProductByBarcode(barcode);
        if (token !== searchTokenRef.current) return;

        if (!foundProduct) {
          lastDetectedRef.current = "";
          setStatus({
            type: "warning",
            message: `Produto ${barcode} não está cadastrado na Open Food Facts. Você pode buscar pelo nome ou conferir o rótulo.`,
          });
          return;
        }
        selectProduct(foundProduct);
      } catch {
        if (token !== searchTokenRef.current) return;
        lastDetectedRef.current = "";
        setStatus({
          type: "error",
          message: "Não foi possível consultar o produto. Verifique sua conexão e tente novamente.",
        });
      }
    },
    [selectProduct],
  );

  const startScanner = useCallback(async () => {
    if (scanControlsRef.current) return;

    if (!window.isSecureContext) {
      setStatus({
        type: "error",
        message:
          "A câmera só funciona em HTTPS ou localhost. Neste endereço o navegador bloqueia o acesso — use o campo de código manual.",
      });
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus({ type: "error", message: "Este navegador não suporta acesso à câmera." });
      return;
    }

    lastDetectedRef.current = "";
    setScannerState("starting");
    setStatus({ type: "loading", message: "Abrindo câmera..." });

    const runId = ++scannerRunIdRef.current;

    try {
      const { BrowserMultiFormatReader, NotFoundException, hints } = await loadScannerLib();
      if (runId !== scannerRunIdRef.current) return;

      const reader = new BrowserMultiFormatReader(hints);
      const controls = await reader.decodeFromVideoDevice(
        undefined,
        videoRef.current,
        (result, error, currentControls) => {
          if (result) {
            const detectedBarcode = cleanBarcode(result.getText());
            if (!detectedBarcode || detectedBarcode === lastDetectedRef.current) return;

            lastDetectedRef.current = detectedBarcode;
            if (navigator.vibrate) navigator.vibrate(60);

            currentControls?.stop();
            scanControlsRef.current = null;
            scannerRunIdRef.current += 1;
            setScannerState("idle");

            searchProduct(detectedBarcode);
            return;
          }

          if (!error || error instanceof NotFoundException) return;

          currentControls?.stop();
          scanControlsRef.current = null;
          scannerRunIdRef.current += 1;
          setScannerState("idle");
          setStatus({
            type: "error",
            message: "A câmera foi interrompida. Ligue novamente ou digite o código.",
          });
        },
      );

      if (runId !== scannerRunIdRef.current) {
        controls.stop();
        return;
      }

      scanControlsRef.current = controls;
      setScannerState("scanning");
      setStatus({ type: "ready", message: "Câmera ativa." });
    } catch (error) {
      setScannerState("idle");
      setStatus({ type: "error", message: describeCameraError(error) });
    }
  }, [searchProduct]);

  // Busca da barra superior: leva para a Consulta e ja procura, de qualquer tela.
  const submitGlobalSearch = (event) => {
    event.preventDefault();
    const term = query.trim();
    if (!term) return;
    navigateTo("consulta");
    searchProduct(term);
  };

  const submitSearch = (event) => {
    event.preventDefault();
    const formQuery = new FormData(event.currentTarget).get("query");
    searchProduct(String(formQuery || query));
  };

  const saveAllergiesForSession = async (nextAllergies, userSnapshot, version) => {
    if (!userSnapshot) {
      if (writeStoredAllergies(nextAllergies)) {
        confirmedAllergiesRef.current = nextAllergies;
        return;
      }

      if (shouldApplyAllergySaveResult(version, allergySaveVersionRef.current)) {
        setSelectedAllergies(confirmedAllergiesRef.current);
        setAuthStatus({
          type: "error",
          message: "Nao consegui salvar suas alergias de visitante. O armazenamento pode estar bloqueado.",
        });
      }
      return;
    }

    if (currentUserRef.current?.id !== userSnapshot.id) return;

    try {
      const { user } = await updateProfileAllergies(nextAllergies);
      if (currentUserRef.current?.id !== userSnapshot.id) return;

      const serverAllergies = Array.isArray(user?.allergies) ? user.allergies : nextAllergies;
      const publicUser = getPublicUser(user);
      currentUserRef.current = publicUser;
      confirmedAllergiesRef.current = serverAllergies;
      setCurrentUser(publicUser);
      if (shouldApplyAllergySaveResult(version, allergySaveVersionRef.current)) {
        selectedAllergiesRef.current = serverAllergies;
        setSelectedAllergies(serverAllergies);
      }
      setAuthStatus({
        type: "success",
        message: "Alergias salvas no perfil online.",
      });
    } catch (error) {
      if (currentUserRef.current?.id !== userSnapshot.id) return;

      if (error.status === 401 && error.code === "UNAUTHENTICATED") {
        restoreGuestSession(
          "Sua sessao expirou. O perfil visitante foi restaurado.",
          "warning",
        );
        return;
      }

      if (shouldApplyAllergySaveResult(version, allergySaveVersionRef.current)) {
        setSelectedAllergies(confirmedAllergiesRef.current);
        setAuthStatus({
          type: "error",
          message: "Nao consegui salvar suas alergias no servidor. Tente novamente.",
        });
      }
    }
  };

  const toggleAllergy = (id) => {
    const previousAllergies = selectedAllergiesRef.current;
    const nextAllergies = previousAllergies.includes(id)
      ? previousAllergies.filter((item) => item !== id)
      : [...previousAllergies, id];
    const userSnapshot = currentUserRef.current;
    const version = ++allergySaveVersionRef.current;

    selectedAllergiesRef.current = nextAllergies;
    setSelectedAllergies(nextAllergies);
    allergySaveQueueRef.current = allergySaveQueueRef.current
      .catch(() => {})
      .then(() => saveAllergiesForSession(nextAllergies, userSnapshot, version));
  };

  const updateAuthForm = (field, value) => {
    setAuthForm((current) => ({ ...current, [field]: value }));
  };

  const submitAuth = async (event) => {
    event.preventDefault();

    const name = authForm.name.trim();
    const email = authForm.email.trim().toLowerCase();
    const password = authForm.password.trim();

    if (!email || !password || (authMode === "register" && !name)) {
      setAuthStatus({
        type: "warning",
        message: "Preencha os campos necessários para continuar.",
      });
      return;
    }

    if (password.length < 6) {
      setAuthStatus({
        type: "warning",
        message: "Use uma senha com pelo menos 6 caracteres.",
      });
      return;
    }

    if (authMode === "register") {
      try {
        const { user } = await registerAccount({
          name,
          email,
          password,
          allergies: selectedAllergies,
        });
        const serverAllergies = Array.isArray(user?.allergies) ? user.allergies : DEFAULT_ALLERGIES;
        const publicUser = getPublicUser(user);
        currentUserRef.current = publicUser;
        setCurrentUser(publicUser);
        setSelectedAllergies(serverAllergies);
        selectedAllergiesRef.current = serverAllergies;
        confirmedAllergiesRef.current = serverAllergies;
        setAuthForm({ name: "", email: "", password: "" });
        setAuthStatus({
          type: "success",
          message: "Conta online criada. Suas alergias foram salvas nesse perfil.",
        });
      } catch (error) {
        setAuthStatus({
          type: error.status === 409 ? "warning" : "error",
          message:
            error.message ||
            "Não consegui criar a conta online. O modo visitante continua funcionando.",
        });
      }
      return;
    }

    try {
      const { user } = await loginAccount({ identifier: email, password });
      const serverAllergies = Array.isArray(user?.allergies) ? user.allergies : DEFAULT_ALLERGIES;
      const publicUser = getPublicUser(user);
      currentUserRef.current = publicUser;
      setCurrentUser(publicUser);
      setSelectedAllergies(serverAllergies);
      selectedAllergiesRef.current = serverAllergies;
      confirmedAllergiesRef.current = serverAllergies;
      setAuthForm({ name: "", email: "", password: "" });
      setAuthStatus({
        type: "success",
        message: `Bem-vindo de volta, ${user.name}.`,
      });
    } catch (error) {
      if (error.status === 401) {
        try {
          const migrated = await migrateLegacyAccount(email, password);
          if (migrated?.user) {
            const migratedAllergies = Array.isArray(migrated.user.allergies)
              ? migrated.user.allergies
              : DEFAULT_ALLERGIES;
            const publicUser = getPublicUser(migrated.user);
            currentUserRef.current = publicUser;
            setCurrentUser(publicUser);
            setSelectedAllergies(migratedAllergies);
            selectedAllergiesRef.current = migratedAllergies;
            confirmedAllergiesRef.current = migratedAllergies;
            setAuthForm({ name: "", email: "", password: "" });
            setAuthStatus({
              type: "success",
              message: "Perfil local atualizado para sincronização online.",
            });
            return;
          }
        } catch {
          // Se a migração não for possível, preserva os dados locais e mantém o erro seguro.
        }

        setAuthStatus({
          type: "error",
          message: "Usuário, e-mail ou senha inválidos.",
        });
        return;
      }

      setAuthStatus({
        type: "error",
        message: "Servidor de contas indisponível. O modo visitante continua funcionando.",
      });
    }
  };

  const logout = async () => {
    try {
      await logoutAccount();
    } catch {
      // Mesmo se o servidor estiver indisponivel, a interface volta para o perfil visitante.
    }

    restoreGuestSession("Voce saiu da conta. Perfil visitante restaurado.");
  };

  const submitAssistant = async (event) => {
    event.preventDefault();
    const question = assistantQuestion.trim();
    if (!question) return;

    lastAssistantQuestionRef.current = question;
    const nextMessages = [...assistantMessages, { role: "user", text: question }];
    setAssistantMessages(nextMessages);
    setAssistantQuestion("");
    setAssistantLoading(true);
    setAssistantConnection({
      type: "loading",
      message: "Analisando o rótulo...",
    });

    await new Promise((resolve) => {
      window.setTimeout(resolve, 120);
    });

    try {
      const result = await askAiAssistant({
        message: question,
        conversation: assistantMessages,
        product,
        guestAllergies: selectedAllergiesRef.current,
      });

      const success = resolveAssistantSuccess(result);
      setAssistantMessages([
        ...nextMessages,
        {
          role: "assistant",
          text: result.answer,
          source: success.source,
          // Veredito autoral do servidor. A UI nunca o deriva do texto.
          verdict: result.allergyVerdict,
        },
      ]);
      setAssistantConnection(success.connection);
    } catch (error) {
      const decision = decideAssistantFallback(error);
      const answer =
        decision.strategy === "local_answer"
          ? buildAssistantAnswer(product, question, allergyScan)
          : decision.text;

      setAssistantMessages([
        ...nextMessages,
        {
          role: "assistant",
          text: answer,
          source: decision.source,
          // Sem backend, o veredito sai do mesmo motor compartilhado, no
          // cliente. O alerta de alergia nao depende de IA nem de rede.
          verdict: buildAllergyVerdict({
            profileRisks: allergyScan.profileRisks,
            profileAllergies: selectedAllergiesRef.current,
            hasProductContext: Boolean(product),
          }),
        },
      ]);
      setAssistantConnection(decision.connection);
    } finally {
      setAssistantLoading(false);
    }
  };

  const retryAssistant = () => {
    const lastQuestion = lastAssistantQuestionRef.current;
    if (!lastQuestion || assistantLoading) return;
    setAssistantQuestion(lastQuestion);
    window.setTimeout(() => {
      document.querySelector("#assistant-question")?.focus();
    }, 0);
  };

  const navigateTo = (page) => {
    setActivePage(page);
    if (page !== activePage) window.history.pushState(null, "", `#${page}`);
  };

  const searchAndOpen = (value) => {
    navigateTo("consulta");
    searchProduct(value);
  };

  const productAnalysis = (
    <ProductAnalysis
      product={product}
      localMatches={localMatches}
      nutrientRows={nutrientRows}
      allergyScan={allergyScan}
      productScore={productScore}
      onSelectProduct={selectProduct}
    />
  );

  const navItems = [
    { id: "home", label: "Início", shortLabel: "Início", icon: Home },
    { id: "consulta", label: "Consulta", shortLabel: "Buscar", icon: Search },
    { id: "scan", label: "Escanear código", shortLabel: "Scan", icon: Camera },
    { id: "alergias", label: "Minhas alergias", shortLabel: "Alergias", icon: ShieldAlert },
    { id: "chat", label: "Assistente", shortLabel: "Assistente", icon: Bot },
    { id: "guia", label: "Guia de rótulos", shortLabel: "Guia", icon: ClipboardList },
    { id: "conta", label: currentUser ? "Minha conta" : "Entrar", icon: currentUser ? User : LogIn },
  ];

  // O celular mostra os cinco destinos de uso diario. Conta fica na barra de
  // cima e Guia tem cartao proprio na tela principal.
  const tabItems = navItems.filter((item) => item.id !== "conta" && item.id !== "guia");

  const renderActivePage = () => {
    if (activePage === "consulta") {
      return (
        <SearchPage
          query={query}
          status={status}
          productAnalysis={productAnalysis}
          onQueryChange={setQuery}
          onSubmitSearch={submitSearch}
          onSearchProduct={searchProduct}
        />
      );
    }

    if (activePage === "scan") {
      return (
        <ScannerPage
          query={query}
          status={status}
          scannerState={scannerState}
          videoRef={videoRef}
          productAnalysis={productAnalysis}
          onQueryChange={setQuery}
          onSubmitSearch={submitSearch}
          onStartScanner={startScanner}
          onStopScanner={stopScanner}
        />
      );
    }

    if (activePage === "alergias") {
      return (
        <AllergiesPage
          currentUser={currentUser}
          selectedAllergies={selectedAllergies}
          productAnalysis={productAnalysis}
          onToggleAllergy={toggleAllergy}
        />
      );
    }

    if (activePage === "chat") {
      return (
        <AssistantPage
          chatLogRef={chatLogRef}
          assistantConnection={assistantConnection}
          assistantMessages={assistantMessages}
          assistantLoading={assistantLoading}
          assistantQuestion={assistantQuestion}
          hasLastQuestion={Boolean(lastAssistantQuestionRef.current)}
          onQuestionChange={setAssistantQuestion}
          onSubmitAssistant={submitAssistant}
          onRetryAssistant={retryAssistant}
        />
      );
    }

    if (activePage === "conta") {
      return (
        <AccountPage
          currentUser={currentUser}
          selectedAllergies={selectedAllergies}
          authMode={authMode}
          authForm={authForm}
          authStatus={authStatus}
          onAuthModeChange={setAuthMode}
          onAuthFormChange={updateAuthForm}
          onSubmitAuth={submitAuth}
          onLogout={logout}
          onToggleAllergy={toggleAllergy}
        />
      );
    }

    if (activePage === "guia") return <GuidePage />;

    return (
      <HomePage
        selectedAllergies={selectedAllergies}
        productAnalysis={productAnalysis}
        onNavigate={navigateTo}
        onSearchAndOpen={searchAndOpen}
      />
    );
  };

  return (
    <div className="app">
      <a className="skip-link" href="#conteudo">
        Pular para o conteúdo
      </a>

      <TopBar
        query={query}
        currentUser={currentUser}
        onQueryChange={setQuery}
        onSubmitSearch={submitGlobalSearch}
        onNavigate={navigateTo}
      />

      <div className="app-body">
        <NavRail
          navItems={navItems}
          activePage={activePage}
          allergyCount={selectedAllergies.length}
          onNavigate={navigateTo}
        />

        <main id="conteudo" className="content" aria-label="Página atual">
          {renderActivePage()}
        </main>
      </div>

      <TabBar
        navItems={tabItems}
        activePage={activePage}
        allergyCount={selectedAllergies.length}
        onNavigate={navigateTo}
      />
    </div>
  );
}

export default App;
