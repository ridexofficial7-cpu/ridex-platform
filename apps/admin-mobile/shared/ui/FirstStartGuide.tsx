import React from "react";
import { SafeAreaView, ScrollView, StyleSheet, Text, View, Pressable } from "react-native";

type Props = { audience: "Customer" | "Driver"; onClose: () => void };

const items = [
  ["Home", "Main starting point for location, service selection and active work."],
  ["Rides / Requests", "Choose or review a ride/service and follow its status."],
  ["Payments / Earnings", "See fare, payment state, earnings and wallet information."],
  ["Safety", "Safety tools, SOS and emergency support."],
  ["Notifications / Messages", "System updates and support communication."],
  ["Profile / KYC", "Account details, onboarding and required profile information."],
];

function FirstStartGuide({ audience, onClose }: Props) {
  return (
    <SafeAreaView style={styles.page}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.brand}><Text style={styles.brandRide}>Ride</Text><Text style={styles.brandX}>X</Text></View>
        <Text style={styles.kicker}>FIRST START</Text>
        <Text style={styles.title}>Know your RideX {audience} app</Text>
        <Text style={styles.subtitle}>A one-time 30-second tour of the main areas. Close it when you are ready; it will not open automatically again on this device.</Text>
        <View style={styles.progressRow} accessibilityLabel={`6 main areas in the RideX ${audience} app`}>{items.map(([title]) => <View key={title} style={styles.progressDot}><Text style={styles.progressText}>{title.slice(0, 1)}</Text></View>)}</View>
        <View style={styles.grid}>
          {items.map(([title, body]) => <View key={title} style={styles.card}><View style={styles.index}><Text style={styles.indexText}>{title.slice(0,1)}</Text></View><Text style={styles.cardTitle}>{title}</Text><Text style={styles.cardBody}>{body}</Text></View>)}
        </View>
        <View style={styles.note}><Text style={styles.noteTitle}>Important</Text><Text style={styles.noteBody}>RideX uses backend-authoritative status, pricing, verification, permissions and operational rules. The app only presents the current authorized state.</Text></View>
        <Pressable style={({ pressed }) => [styles.close, pressed && styles.closePressed]} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close first start guide"><Text style={styles.closeText}>Close & Start RideX</Text></Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles=StyleSheet.create({
  page:{flex:1,backgroundColor:"#F8FAFC"},
  scroll:{padding:22,paddingBottom:36},
  brand:{flexDirection:"row",alignItems:"baseline",marginBottom:14},
  brandRide:{fontSize:30,fontWeight:"900",color:"#111827"},
  brandX:{fontSize:30,fontWeight:"900",color:"#E11D48"},
  kicker:{fontSize:11,fontWeight:"900",letterSpacing:1.4,color:"#E11D48",marginBottom:6},
  title:{fontSize:30,fontWeight:"900",color:"#0F172A",lineHeight:36},
  subtitle:{fontSize:14,lineHeight:21,color:"#64748B",marginTop:8,marginBottom:18},
  grid:{gap:10},
  card:{backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#E2E8F0",borderRadius:16,padding:14},
  index:{width:34,height:34,borderRadius:10,backgroundColor:"#FFF1F2",alignItems:"center",justifyContent:"center",marginBottom:8},
  indexText:{fontWeight:"900",color:"#E11D48"},
  cardTitle:{fontSize:15,fontWeight:"900",color:"#0F172A"},
  cardBody:{fontSize:12.5,lineHeight:18,color:"#64748B",marginTop:4},
  note:{marginTop:14,borderRadius:16,backgroundColor:"#EFF6FF",borderWidth:1,borderColor:"#D7E8FF",padding:14},
  noteTitle:{fontSize:13,fontWeight:"900",color:"#0369A1"},
  noteBody:{fontSize:12,lineHeight:18,color:"#475569",marginTop:4},
  close:{marginTop:18,minHeight:50,borderRadius:14,backgroundColor:"#E11D48",alignItems:"center",justifyContent:"center",paddingHorizontal:18},
  closeText:{color:"#FFFFFF",fontSize:15,fontWeight:"900"},
  closePressed:{opacity:0.86,transform:[{scale:0.99}]},
  progressRow:{flexDirection:"row",gap:6,marginBottom:4},
  progressDot:{width:30,height:30,borderRadius:10,borderWidth:1,borderColor:"#FBCDD1",backgroundColor:"#FFF7F8",alignItems:"center",justifyContent:"center"},
  progressText:{fontSize:11,fontWeight:"900",color:"#C61E48"},
});

export default React.memo(FirstStartGuide);
