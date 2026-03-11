import React, { useEffect, useMemo, useState } from "react";
import { SafeAreaView, Text, TextInput, TouchableOpacity, View, ScrollView, Alert } from "react-native";
import { createClient } from "@supabase/supabase-js";
import Constants from "expo-constants";
import { createApiClient } from "@estalen/sdk";

const extra = Constants.expoConfig?.extra || {};
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || extra.supabaseUrl;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || extra.supabaseAnonKey;
const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL || extra.apiBaseUrl || "http://localhost:3000";

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: true, autoRefreshToken: true }
});

export default function App() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [session, setSession] = useState(null);
  const [plan, setPlan] = useState(null);
  const [projects, setProjects] = useState([]);
  const [screen, setScreen] = useState("home"); // home | editor
  const [activeProject, setActiveProject] = useState(null);
  const [editorText, setEditorText] = useState("");

  const api = useMemo(() => createApiClient({
    baseUrl: apiBaseUrl,
    getAccessToken: async () => {
      const { data } = await supabase.auth.getSession();
      return data.session?.access_token ?? null;
    }
  }), []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  async function login() {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) Alert.alert("Erro", error.message);
  }

  async function logout() {
    await supabase.auth.signOut();
  }

  async function loadPlan() {
    try {
      const p = await api.myPlan();
      setPlan(p);
    } catch (e) {
      Alert.alert("Erro", "Falha ao carregar plano. Verifique o backend e o token.");
    }
  }

  async function loadProjects() {
    try {
      const pr = await api.listProjects();
      setProjects(pr?.data ?? pr ?? []);
    } catch (e) {
      Alert.alert("Erro", "Falha ao carregar projetos.");
    }
  }

  async function createProject(kind) {
    try {
      const title = `Novo ${kind}`;
      const created = await api.createProject({
        title,
        kind,
        data: {
          editor: {
            version: 1,
            mode: { professor: false, transparent: false },
            doc: { text: "" },
            aiSteps: []
          }
        }
      });
      const id = created?.data?.id || created?.id;
      await loadProjects();
      if (id) {
        await openEditor(id);
      }
    } catch (e) {
      Alert.alert("Erro", "Falha ao criar projeto.");
    }
  }

  async function openEditor(projectId) {
    try {
      const p = await api.getProject(projectId);
      const proj = (p?.data || p);
      setActiveProject(proj);
      setEditorText(proj?.data?.editor?.doc?.text || "");
      setScreen("editor");
    } catch (e) {
      Alert.alert("Erro", "Falha ao abrir editor.");
    }
  }

  async function saveEditor() {
    if (!activeProject?.id) return;
    try {
      await api.updateProject(activeProject.id, {
        data: {
          ...(activeProject.data || {}),
          editor: {
            ...(activeProject.data?.editor || {}),
            doc: { text: editorText }
          }
        }
      });
      Alert.alert("OK", "Projeto salvo.");
    } catch (e) {
      Alert.alert("Erro", "Falha ao salvar.");
    }
  }

  async function aiGenerateText() {
    try {
      const res = await api.aiTextGenerate({ prompt: editorText || "Gere um texto curto" });
      const content = res?.text || res?.output || res?.content || JSON.stringify(res);
      setEditorText(String(content));
    } catch (e) {
      Alert.alert("Erro", "IA não configurada ou falha na chamada.");
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0A0F24" }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Text style={{ color: "white", fontSize: 22, fontWeight: "700" }}>Editor AI Creator</Text>
        <Text style={{ color: "rgba(255,255,255,0.8)" }}>Autocrie.ai</Text>

        {!session ? (
          <View style={card()}>
            <Text style={{ color: "white", fontSize: 16, fontWeight: "600" }}>Login</Text>
            <TextInput value={email} onChangeText={setEmail} placeholder="email" placeholderTextColor="#9aa"
              style={input()} autoCapitalize="none" />
            <TextInput value={password} onChangeText={setPassword} placeholder="senha" placeholderTextColor="#9aa"
              style={input()} secureTextEntry />
            <TouchableOpacity onPress={login} style={button()}>
              <Text style={{ color: "white", fontWeight: "700" }}>Entrar</Text>
            </TouchableOpacity>
          </View>
        ) : screen === "editor" ? (
          <View style={{ gap: 12 }}>
            <View style={card()}>
              <Text style={{ color: "white", fontWeight: "700" }}>Editor (MVP)</Text>
              <Text style={{ color: "rgba(255,255,255,0.8)" }}>{activeProject?.title}</Text>
              <TextInput
                value={editorText}
                onChangeText={setEditorText}
                placeholder="Escreva ou gere com a Autocrie…"
                placeholderTextColor="#9aa"
                style={[input(), { minHeight: 140, textAlignVertical: "top" }]}
                multiline
              />
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TouchableOpacity onPress={aiGenerateText} style={[button(), { flex: 1 }]}> 
                  <Text style={{ color: "white", fontWeight: "700" }}>Gerar</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={saveEditor} style={[button("rgba(255,255,255,0.12)"), { flex: 1 }]}> 
                  <Text style={{ color: "white", fontWeight: "700" }}>Salvar</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity onPress={() => setScreen("home")} style={button("rgba(255,255,255,0.12)")}>
                <Text style={{ color: "white", fontWeight: "700" }}>Voltar</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            <View style={card()}>
              <Text style={{ color: "white", fontWeight: "700" }}>Logado</Text>
              <Text style={{ color: "rgba(255,255,255,0.85)" }}>{session?.user?.email}</Text>
              <View style={{ height: 10 }} />
              <TouchableOpacity onPress={logout} style={button("rgba(255,255,255,0.12)")}>
                <Text style={{ color: "white", fontWeight: "700" }}>Sair</Text>
              </TouchableOpacity>
            </View>

            <View style={card()}>
              <Text style={{ color: "white", fontWeight: "700" }}>Plano</Text>
              <TouchableOpacity onPress={loadPlan} style={button()}>
                <Text style={{ color: "white", fontWeight: "700" }}>Carregar plano do backend</Text>
              </TouchableOpacity>
              <Text style={{ color: "rgba(255,255,255,0.85)", marginTop: 8 }}>
                {plan ? JSON.stringify(plan, null, 2) : "—"}
              </Text>
            </View>

            <View style={card()}>
              <Text style={{ color: "white", fontWeight: "700" }}>Projetos</Text>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                <TouchableOpacity onPress={loadProjects} style={[button(), { flex: 1 }]}>
                  <Text style={{ color: "white", fontWeight: "700" }}>Atualizar</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => createProject("text")} style={[button("rgba(255,255,255,0.12)"), { flex: 1 }]}>
                  <Text style={{ color: "white", fontWeight: "700" }}>Novo Texto</Text>
                </TouchableOpacity>
              </View>

              {projects?.length ? projects.map((p) => (
                <TouchableOpacity key={p.id} onPress={() => openEditor(p.id)} style={[button("rgba(0,0,0,0.18)"), { marginTop: 8 }]}>
                  <Text style={{ color: "white", fontWeight: "700" }}>{p.title}</Text>
                  <Text style={{ color: "rgba(255,255,255,0.8)", fontSize: 12 }}>kind: {p.kind}</Text>
                </TouchableOpacity>
              )) : (
                <Text style={{ color: "rgba(255,255,255,0.8)", marginTop: 8 }}>Nenhum projeto carregado.</Text>
              )}
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function card() {
  return {
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.06)",
    gap: 10
  };
}
function input() {
  return {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(0,0,0,0.22)",
    color: "white"
  };
}
function button(bg) {
  return {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: bg || "#6B5BFF",
    alignItems: "center"
  };
}
