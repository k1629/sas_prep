/**
 * SAS Exam Master Hub - Firebase Auth, Profile Sync & 7-Day Trial Engine
 * Vanilla ES Module integration for PWA with zero build step dependencies.
 */

// 1. Live Firebase Project Config
export const firebaseConfig = {
  apiKey: "AIzaSyC3R1HHZceNtr97vUFTnhhzGgWh2CqSiPo",
  authDomain: "sas-exam-prep.firebaseapp.com",
  projectId: "sas-exam-prep",
  storageBucket: "sas-exam-prep.firebasestorage.app",
  messagingSenderId: "767488153309",
  appId: "1:767488153309:web:aad29ad5af3575eae92d34",
  measurementId: "G-XZYFBRE0QW"
};

// State
export let currentUser = null;
export let userProfile = null;
export let trialDaysRemaining = 7;
export let isSubscriptionActive = false;
export let isTrialActive = true;

const TRIAL_DURATION_DAYS = 7;
const TRIAL_DURATION_MS = TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000;

// Local fallback store for offline / mock testing
function getLocalFallbackUser() {
  const stored = localStorage.getItem("sas_current_user_profile");
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch (e) {
      return null;
    }
  }
  return null;
}

function saveLocalFallbackUser(profile) {
  localStorage.setItem("sas_current_user_profile", JSON.stringify(profile));
}

/**
 * Calculates trial and subscription status
 */
export function calculateSubscriptionStatus(profile) {
  if (!profile) return { isTrialActive: true, isSubscriptionActive: false, daysLeft: 7 };

  // If already paid subscriber
  if (profile.subscription && profile.subscription.status === "active") {
    const expiresAt = new Date(profile.subscription.currentPeriodEnd).getTime();
    if (expiresAt > Date.now()) {
      return { isTrialActive: false, isSubscriptionActive: true, daysLeft: Math.ceil((expiresAt - Date.now()) / (24 * 60 * 60 * 1000)) };
    }
  }

  // Check trial period
  const trialStart = profile.trialStartDate ? new Date(profile.trialStartDate).getTime() : Date.now();
  const trialEnd = trialStart + TRIAL_DURATION_MS;
  const now = Date.now();

  if (now < trialEnd) {
    const daysLeft = Math.max(1, Math.ceil((trialEnd - now) / (24 * 60 * 60 * 1000)));
    return { isTrialActive: true, isSubscriptionActive: false, daysLeft };
  } else {
    return { isTrialActive: false, isSubscriptionActive: false, daysLeft: 0 };
  }
}

/**
 * Creates a standard fresh candidate profile
 */
export function createDefaultProfile(uid, email, displayName, photoURL) {
  const nowIso = new Date().toISOString();
  return {
    uid: uid || "guest_" + Math.random().toString(36).substring(2, 9),
    email: email || "candidate@iaad.gov.in",
    displayName: displayName || "Audit Candidate",
    photoURL: photoURL || "",
    role: "candidate",
    createdAt: nowIso,
    trialStartDate: nowIso,
    subscription: {
      status: "trial", // "trial" | "active" | "expired"
      plan: "7_day_trial",
      currentPeriodEnd: new Date(Date.now() + TRIAL_DURATION_MS).toISOString()
    },
    progress: {
      completedTopicsCount: 0,
      totalTopics: 25,
      overallPercentage: 0,
      topicStatuses: {},
      chapterStatuses: {}
    },
    quizStats: {
      testsAttempted: 0,
      totalAnswered: 0,
      correctAnswers: 0,
      accuracy: 0
    },
    starredOneLiners: [],
    customNotes: {}
  };
}

/**
 * Initializes Authentication & Profile Listeners
 */
export async function initAuthAndSync(onProfileUpdateCallback) {
  // Check if Firebase SDK is accessible from CDN
  const hasFirebase = window.firebase && window.firebase.auth && window.firebase.firestore;

  if (hasFirebase && firebaseConfig.apiKey !== "AIzaSyDemoPlaceholderKeyForSASPrepHub12345") {
    try {
      if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
      }
      const auth = firebase.auth();
      const db = firebase.firestore();

      auth.onAuthStateChanged(async (user) => {
        if (user) {
          currentUser = user;
          const userDocRef = db.collection("users").doc(user.uid);
          const doc = await userDocRef.get();

          if (doc.exists) {
            userProfile = doc.data();
          } else {
            userProfile = createDefaultProfile(user.uid, user.email, user.displayName, user.photoURL);
            await userDocRef.set(userProfile);
          }

          updateLocalStateAndNotify(onProfileUpdateCallback);
        } else {
          // Fallback guest / local candidate
          loadOrInitLocalProfile(onProfileUpdateCallback);
        }
      });
      return;
    } catch (err) {
      console.warn("[SAS Auth] Firebase network init failed, falling back to local trial engine:", err);
    }
  }

  // Graceful offline/local mode fallback
  loadOrInitLocalProfile(onProfileUpdateCallback);
}

function loadOrInitLocalProfile(callback) {
  let profile = getLocalFallbackUser();
  if (!profile) {
    profile = createDefaultProfile();
    saveLocalFallbackUser(profile);
  }
  userProfile = profile;
  currentUser = {
    uid: profile.uid,
    email: profile.email,
    displayName: profile.displayName
  };
  updateLocalStateAndNotify(callback);
}

function updateLocalStateAndNotify(callback) {
  const status = calculateSubscriptionStatus(userProfile);
  isTrialActive = status.isTrialActive;
  isSubscriptionActive = status.isSubscriptionActive;
  trialDaysRemaining = status.daysLeft;

  // Sync to app.js userStore if present
  if (window.userStore && userProfile.progress) {
    if (userProfile.progress.topicStatuses) window.userStore.status = userProfile.progress.topicStatuses;
    if (userProfile.progress.chapterStatuses) window.userStore.chapterStatus = userProfile.progress.chapterStatuses;
  }

  if (typeof callback === "function") {
    callback(userProfile, status);
  }
}

/**
 * Saves candidate progress to Cloud Firestore or local cache
 */
export async function syncProgressToCloud(progressData) {
  if (!userProfile) return;

  userProfile.progress = {
    ...userProfile.progress,
    ...progressData
  };
  saveLocalFallbackUser(userProfile);

  // If live Firebase is available
  if (window.firebase && window.firebase.apps && window.firebase.apps.length && currentUser) {
    try {
      const db = firebase.firestore();
      await db.collection("users").doc(currentUser.uid).update({
        progress: userProfile.progress,
        lastActiveAt: new Date().toISOString()
      });
    } catch (e) {
      console.warn("[SAS Sync] Cloud update queued / offline:", e);
    }
  }
}

/**
 * Triggers Google Sign-In via Popup
 */
export async function signInWithGoogle() {
  if (!window.firebase || !window.firebase.auth) {
    alert("Firebase Auth SDK loading... Please try in a moment.");
    return;
  }
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    const result = await firebase.auth().signInWithPopup(provider);
    return result.user;
  } catch (error) {
    console.error("[SAS Auth] Google sign in error:", error);
    if (error.code === "auth/popup-closed-by-user") return;
    alert("Sign-In notice: " + (error.message || "Failed to sign in."));
  }
}

/**
 * Signs out current candidate
 */
export async function signOutUser() {
  if (window.firebase && window.firebase.auth) {
    await firebase.auth().signOut();
    localStorage.removeItem("sas_current_user_profile");
    window.location.reload();
  }
}

/**
 * Simulates subscription activation (for testing/Razorpay webhook)
 */
export async function activateProSubscription(planName = "6_months_mastery", months = 6) {
  if (!userProfile) return;
  const expiry = new Date(Date.now() + months * 30 * 24 * 60 * 60 * 1000).toISOString();
  userProfile.subscription = {
    status: "active",
    plan: planName,
    currentPeriodEnd: expiry
  };
  saveLocalFallbackUser(userProfile);

  if (window.firebase && window.firebase.apps && window.firebase.apps.length && currentUser) {
    try {
      const db = firebase.firestore();
      await db.collection("users").doc(currentUser.uid).update({
        subscription: userProfile.subscription
      });
    } catch (e) {}
  }

  const status = calculateSubscriptionStatus(userProfile);
  isTrialActive = status.isTrialActive;
  isSubscriptionActive = status.isSubscriptionActive;
  trialDaysRemaining = status.daysLeft;

  return status;
}
