import React, { useMemo } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";

type Props = { text: string; mine?: boolean };

type Token = { kind: "text" | "bold" | "code" | "math"; value: string };

function inlineTokens(input: string): Token[] {
  const tokens: Token[] = [];
  let rest = input;
  const pattern = /(\*\*([^*]+)\*\*|`([^`]+)`|\$([^$]+)\$)/;
  while (rest) {
    const match = rest.match(pattern);
    if (!match || match.index === undefined) {
      tokens.push({ kind: "text", value: rest });
      break;
    }
    if (match.index > 0) tokens.push({ kind: "text", value: rest.slice(0, match.index) });
    if (match[2]) tokens.push({ kind: "bold", value: match[2] });
    else if (match[3]) tokens.push({ kind: "code", value: match[3] });
    else if (match[4]) tokens.push({ kind: "math", value: match[4] });
    rest = rest.slice(match.index + match[0].length);
  }
  return tokens;
}

function InlineText({ value, mine }: { value: string; mine?: boolean }) {
  const tokens = useMemo(() => inlineTokens(value), [value]);
  return (
    <Text style={[styles.text, mine && styles.mineText]}>
      {tokens.map((token, index) => {
        if (token.kind === "bold") return <Text key={index} style={styles.bold}>{token.value}</Text>;
        if (token.kind === "code") return <Text key={index} style={styles.inlineCode}>{token.value}</Text>;
        if (token.kind === "math") return <Text key={index} style={styles.math}>{token.value}</Text>;
        return <Text key={index}>{token.value}</Text>;
      })}
    </Text>
  );
}

export default function RideXMarkdown({ text, mine = false }: Props) {
  const blocks = useMemo(() => {
    const lines = String(text || "").replace(/\r/g, "").split("\n");
    const result: Array<{ type: string; value: string; level?: number }> = [];
    let code = false;
    let codeLines: string[] = [];
    for (const line of lines) {
      if (line.trim().startsWith("```")) {
        if (code) {
          result.push({ type: "code", value: codeLines.join("\n") });
          codeLines = [];
        }
        code = !code;
        continue;
      }
      if (code) {
        codeLines.push(line);
        continue;
      }
      const heading = /^(#{1,3})\s+(.+)$/.exec(line);
      if (heading) result.push({ type: "heading", value: heading[2], level: heading[1].length });
      else if (/^[-*]\s+/.test(line)) result.push({ type: "bullet", value: line.replace(/^[-*]\s+/, "") });
      else if (/^\d+\.\s+/.test(line)) result.push({ type: "number", value: line.replace(/^\d+\.\s+/, "") });
      else if (line.trim()) result.push({ type: "text", value: line });
      else result.push({ type: "space", value: "" });
    }
    if (code) result.push({ type: "code", value: codeLines.join("\n") });
    return result;
  }, [text]);

  return (
    <View style={styles.container}>
      {blocks.map((block, index) => {
        if (block.type === "space") return <View key={index} style={{ height: 6 }} />;
        if (block.type === "code") return <View key={index} style={styles.codeBlock}><Text selectable style={styles.codeText}>{block.value}</Text></View>;
        if (block.type === "heading") return <Text key={index} style={[styles.heading, block.level === 1 ? styles.h1 : block.level === 2 ? styles.h2 : styles.h3]}>{block.value}</Text>;
        if (block.type === "bullet") return <View key={index} style={styles.listRow}><Text style={styles.bullet}>•</Text><InlineText value={block.value} mine={mine} /></View>;
        if (block.type === "number") return <View key={index} style={styles.listRow}><Text style={styles.number}>{index + 1}.</Text><InlineText value={block.value} mine={mine} /></View>;
        return <InlineText key={index} value={block.value} mine={mine} />;
      })}
    </View>
  );
}

export function LinkText({ label, url }: { label: string; url: string }) {
  return <Pressable onPress={() => void Linking.openURL(url)}><Text style={styles.link}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  container: { width: "100%" },
  text: { fontSize: 14, lineHeight: 21, color: "#1F2937" },
  mineText: { color: "#FFFFFF" },
  bold: { fontWeight: "800" },
  inlineCode: { fontFamily: "monospace", backgroundColor: "#F1F5F9", color: "#BE123C", paddingHorizontal: 4 },
  math: { fontFamily: "monospace", fontStyle: "italic", color: "#2563EB" },
  heading: { fontWeight: "900", color: "#0F172A", marginBottom: 5 },
  h1: { fontSize: 20 }, h2: { fontSize: 17 }, h3: { fontSize: 15 },
  listRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: 3 },
  bullet: { width: 18, fontSize: 16, color: "#BE123C", lineHeight: 21 },
  number: { width: 24, fontSize: 13, color: "#BE123C", fontWeight: "800", lineHeight: 21 },
  codeBlock: { backgroundColor: "#0F172A", borderRadius: 12, padding: 12, marginVertical: 5 },
  codeText: { color: "#E2E8F0", fontFamily: "monospace", fontSize: 12, lineHeight: 18 },
  link: { color: "#2563EB", textDecorationLine: "underline", fontWeight: "700" },
});
