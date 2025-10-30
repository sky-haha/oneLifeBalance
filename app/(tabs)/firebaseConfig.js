import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

import { getAnalytics } from "firebase/analytics";


const firebaseConfig = {
  apiKey: "AIzaSyA39LGb29fLrj1V9SDoswqgCYto-UGRjJQ",
  authDomain: "onelifebalance-ca9b0.firebaseapp.com",
  projectId: "onelifebalance-ca9b0",
  storageBucket: "onelifebalance-ca9b0.firebasestorage.app",
  messagingSenderId: "774270570460",
  appId: "1:774270570460:web:37a320407907dcf3194919",
  measurementId: "G-Z3BZ0Z7312"
};


const app = initializeApp(firebaseConfig);

const analytics = getAnalytics(app);

// 서비스 가져오기 (로그인, DB 등)
export const auth = getAuth(app);        // Firebase 인증
export const db = getFirestore(app);     // Cloud Firestore.