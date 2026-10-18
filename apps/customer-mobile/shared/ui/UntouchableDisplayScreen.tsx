import React from "react";
import { Image } from "react-native";
import type { RideXRemoteAsset, RideXRemoteAssetImageSource } from "../assets/remote";
import { SafeAreaView, ScrollView, StyleSheet, Text, View, Pressable } from "react-native";

type Props = { audience: "Customer" | "Driver"; onClose: () => void; remoteAsset?: RideXRemoteAsset | null; remoteAssetSource?: RideXRemoteAssetImageSource | null };

export default function UntouchableDisplayScreen({ audience, onClose, remoteAsset, remoteAssetSource }: Props) {
  return (
    <SafeAreaView style={styles.page}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.top}><Text style={styles.brand}>Ride<Text style={styles.brandX}>X</Text></Text><Text style={styles.kicker}>DISPLAY</Text></View>
        <View style={styles.display} accessible accessibilityRole="image" accessibilityLabel={`RideX non-interactive display for ${audience}`}>
          {remoteAssetSource ? (
            <Image source={remoteAssetSource} style={styles.remoteImage} resizeMode="cover" accessibilityLabel={remoteAsset?.name || `RideX ${audience} display`} />
          ) : (
            <>
              <Text style={styles.small}>RIDEX • {audience.toUpperCase()}</Text>
              <Text style={styles.title}>Safe. Clean. Affordable.</Text>
              <Text style={styles.body}>This is the default non-interactive display area. It is reserved for future Admin-managed promotional or informational content.</Text>
              <View style={styles.rule} />
              <Text style={styles.footer}>Default content is shown when no configured media is available.</Text>
            </>
          )}
        </View>
        <Text style={styles.note}>The display content itself is intentionally non-interactive. Only the navigation close control is actionable.</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Close display" style={({ pressed }) => [styles.close, pressed && { opacity: 0.82 }]} onPress={onClose}><Text style={styles.closeText}>Close</Text></Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles=StyleSheet.create({
  page:{flex:1,backgroundColor:"#F8FAFC"},
  scroll:{padding:22,paddingBottom:36},
  top:{marginBottom:16},
  brand:{fontSize:28,fontWeight:"900",color:"#0F172A"},
  brandX:{color:"#E11D48"},
  kicker:{fontSize:11,fontWeight:"900",letterSpacing:1.4,color:"#64748B",marginTop:4},
  display:{minHeight:360,borderRadius:24,borderWidth:1,borderColor:"#E2E8F0",backgroundColor:"#FFFFFF",padding:12,justifyContent:"center",overflow:"hidden"},
  remoteImage:{width:"100%",minHeight:360,borderRadius:18},
  small:{fontSize:11,fontWeight:"900",letterSpacing:1.2,color:"#E11D48"},
  title:{fontSize:34,fontWeight:"900",lineHeight:40,color:"#0F172A",marginTop:12},
  body:{fontSize:15,lineHeight:22,color:"#64748B",marginTop:12},
  rule:{height:1,backgroundColor:"#E2E8F0",marginVertical:24},
  footer:{fontSize:12,lineHeight:18,color:"#94A3B8"},
  note:{fontSize:12,lineHeight:18,color:"#64748B",marginTop:12},
  close:{marginTop:18,minHeight:48,borderWidth:1.5,borderColor:"#E11D48",borderRadius:14,alignItems:"center",justifyContent:"center"},
  closeText:{fontSize:15,fontWeight:"900",color:"#E11D48"},
});
