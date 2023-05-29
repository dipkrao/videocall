import React, { useRef } from "react";

import {
  Button,
  Dimensions,
  KeyboardAvoidingView,
  SafeAreaView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Icon from "react-native-vector-icons/Ionicons";
import {
  RTCPeerConnection,
  RTCIceCandidate,
  RTCSessionDescription,
  RTCView,
  MediaStream,
  mediaDevices,
} from "react-native-webrtc";
import { useState } from "react";

import firestore from "@react-native-firebase/firestore";
import { Text } from "react-native";

const App = () => {
  const [callerId] = useState(
    Math.floor(100000 + Math.random() * 900000).toString()
  );

  const [showCallerId, setShowCallerId] = useState(false);
  const [showBack, setShowBack] = useState(false);
  const [showInput, setShowInput] = useState(false);
  const [remoteStream, setRemoteStream] = useState(null);
  const [webcamStarted, setWebcamStarted] = useState(false);
  const [localStream, setLocalStream] = useState(null);
  const [channelId, setChannelId] = useState(null);
  const pc = useRef();
  const servers = {
    iceServers: [
      {
        urls: [
          "stun:stun1.l.google.com:19302",
          "stun:stun2.l.google.com:19302",
        ],
      },
    ],
    iceCandidatePoolSize: 10,
  };

  const startWebcam = async () => {
    pc.current = new RTCPeerConnection(servers);
    const local = await mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });
    pc.current.addStream(local);
    setLocalStream(local);
    const remote = new MediaStream();
    setRemoteStream(remote);

    // Push tracks from local stream to peer connection
    local.getTracks().forEach((track) => {
      console.log(pc.current.getLocalStreams());
      pc.current.getLocalStreams()[0].addTrack(track);
    });

    // Pull tracks from remote stream, add to video stream
    pc.current.ontrack = (event) => {
      event.streams[0].getTracks().forEach((track) => {
        remote.addTrack(track);
      });
    };

    pc.current.onaddstream = (event) => {
      setRemoteStream(event.stream);
    };

    setWebcamStarted(true);
  };

  const startCall = async () => {
    startWebcam();
    setShowBack(true);
    setShowCallerId(true);
    const meetingCode = Math.floor(100000 + Math.random() * 900000).toString();
    const channelDoc = firestore().collection("channels").doc(meetingCode);
    const offerCandidates = channelDoc.collection("offerCandidates");
    const answerCandidates = channelDoc.collection("answerCandidates");

    setChannelId(channelDoc.id);

    pc.current.onicecandidate = async (event) => {
      if (event.candidate) {
        await offerCandidates.add(event.candidate.toJSON());
      }
    };

    //create offer
    const offerDescription = await pc.current.createOffer();
    await pc.current.setLocalDescription(offerDescription);

    const offer = {
      sdp: offerDescription.sdp,
      type: offerDescription.type,
    };

    await channelDoc.set({ offer });

    // Listen for remote answer
    channelDoc.onSnapshot((snapshot) => {
      const data = snapshot.data();
      if (!pc.current.currentRemoteDescription && data?.answer) {
        const answerDescription = new RTCSessionDescription(data.answer);
        pc.current.setRemoteDescription(answerDescription);
      }
    });

    // When answered, add candidate to peer connection
    answerCandidates.onSnapshot((snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === "added") {
          const data = change.doc.data();
          pc.current.addIceCandidate(new RTCIceCandidate(data));
        }
      });
    });
  };

  const joinCall = async () => {
    startWebcam();
    setShowInput(true);
    setShowBack(true);
    setShowCallerId(true);
    const channelDoc = firestore().collection("channels").doc(channelId);
    const offerCandidates = channelDoc.collection("offerCandidates");
    const answerCandidates = channelDoc.collection("answerCandidates");

    pc.current.onicecandidate = async (event) => {
      if (event.candidate) {
        await answerCandidates.add(event.candidate.toJSON());
      }
    };

    const channelDocument = await channelDoc.get();
    const channelData = channelDocument.data();

    const offerDescription = channelData.offer;

    await pc.current.setRemoteDescription(
      new RTCSessionDescription(offerDescription)
    );

    const answerDescription = await pc.current.createAnswer();
    await pc.current.setLocalDescription(answerDescription);

    const answer = {
      type: answerDescription.type,
      sdp: answerDescription.sdp,
    };

    await channelDoc.update({ answer });

    offerCandidates.onSnapshot((snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === "added") {
          const data = change.doc.data();
          pc.current.addIceCandidate(new RTCIceCandidate(data));
        }
      });
    });
  };

  function leave() {
    setShowCallerId(false);
    setWebcamStarted(false);
    setRemoteStream(null);
    setLocalStream(null);
    setShowInput(false);
    setShowBack(false);
  }

  return (
    <SafeAreaView style={styles.main}>
      {showBack ? (
        <TouchableOpacity style={styles.backButton} onPress={leave}>
          <Icon name="arrow-back" size={25} color="white" />
        </TouchableOpacity>
      ) : null}

      {localStream && (
        <RTCView
          streamURL={localStream?.toURL()}
          style={styles.stream}
          objectFit="cover"
          mirror
        />
      )}

      {remoteStream && (
        <RTCView
          streamURL={remoteStream?.toURL()}
          style={styles.stream}
          objectFit="cover"
          mirror
        />
      )}

      {!showCallerId ? (
        <View style={styles.callContainer}>
          <Text style={styles.callerTxt}>Your Caller ID</Text>
          <View style={styles.callCodeFrame}>
            <Text style={styles.callerCode}>{callerId}</Text>
          </View>
          <TouchableOpacity style={styles.buttonContainer} onPress={startCall}>
            <Text style={styles.textStyle}>Start Call</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {!showBack ? null : (
        <TouchableOpacity style={styles.endcall} onPress={leave}>
          <Icon name="call" size={30} color="white" />
        </TouchableOpacity>
      )}

      {!showCallerId ? (
        <>
          <View style={styles.callerIdContainer}>
            <Text
              style={{
                fontSize: 18,
                color: "#D0D4DD",
              }}
            >
              Enter call id of another user
            </Text>
            <TextInput
              value={channelId}
              placeholder="Enter caller Id"
              keyboardType="number-pad"
              multiline={false}
              minLength={45}
              style={{
                marginTop: 10,
                borderWidth: 1,
                backgroundColor: "white",
                padding: 4,
              }}
              onChangeText={(newText) => setChannelId(newText)}
            />
            {/* button for meweting join */}
            <TouchableOpacity
              style={[styles.buttonContainer, { marginTop: 20 }]}
              onPress={joinCall}
            >
              <Text style={styles.textStyle}>
                {!showInput ? "Join Call" : "Join Now"}
              </Text>
            </TouchableOpacity>
          </View>
        </>
      ) : null}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  main: {
    flex: 1,
    backgroundColor: "white",
    justifyContent: "center",
  },
  stream: {
    flex: 1,
    width: Dimensions.get("window").width,
    height: 200,
  },
  callCodeFrame: {
    flexDirection: "row",
    marginTop: 12,
    alignItems: "center",
  },
  callContainer: {
    padding: 35,
    marginHorizontal: 25,
    backgroundColor: "#1A1C22",
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 14,
  },
  callerTxt: {
    fontSize: 18,
    color: "#D0D4DD",
  },
  backButton: {
    backgroundColor: "#1A1C22",
    padding: 5,
    margin: 15,
    position: "absolute",
    top: 0,
    zIndex: 9999,
    borderRadius: 50,
  },
  callerCode: {
    fontSize: 32,
    color: "#ffff",
    letterSpacing: 6,
  },
  callerIdContainer: {
    backgroundColor: "#1A1C22",
    padding: 40,
    margin: 25,
    justifyContent: "center",
    borderRadius: 14,
  },
  endcall: {
    backgroundColor: "red",
    padding: 15,
    alignSelf: "center",
    marginVertical: 20,
    justifyContent: "center",
    borderRadius: 50,
  },
  buttonContainer: {
    backgroundColor: "#1A4584",
    alignSelf: "center",
    marginTop: 10,
    justifyContent: "center",
    borderRadius: 5,
  },
  textStyle: {
    color: "white",
    fontSize: 18,
    textAlign: "center",
    fontWeight: "600",
    width: 150,
    padding: 10,
  },
});

export default App;
