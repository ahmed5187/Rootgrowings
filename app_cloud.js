// app_cloud.js
import { initializeApp } from "firebase/app";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut } from "firebase/auth";
import { getFirestore, collection, addDoc, getDocs, updateDoc, deleteDoc, doc } from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { firebaseConfig } from "./firebase-config.js";

// Init Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// Google login
export async function loginWithGoogle() {
  const provider = new GoogleAuthProvider();
  try {
    const result = await signInWithPopup(auth, provider);
    return result.user;
  } catch (error) {
    console.error("Login error:", error);
  }
}

// Logout
export async function logout() {
  await signOut(auth);
}

// Save plant data
export async function addPlant(plantData, imageFile) {
  try {
    let imageUrl = null;
    if (imageFile) {
      const storageRef = ref(storage, `plants/${Date.now()}_${imageFile.name}`);
      await uploadBytes(storageRef, imageFile);
      imageUrl = await getDownloadURL(storageRef);
    }
    const docRef = await addDoc(collection(db, "plants"), {
      ...plantData,
      imageUrl
    });
    return docRef.id;
  } catch (e) {
    console.error("Error adding plant:", e);
  }
}

// Get plants
export async function getPlants() {
  const snapshot = await getDocs(collection(db, "plants"));
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

// Update plant
export async function updatePlant(id, data) {
  await updateDoc(doc(db, "plants", id), data);
}

// Delete plant
export async function deletePlant(id) {
  await deleteDoc(doc(db, "plants", id));
}
