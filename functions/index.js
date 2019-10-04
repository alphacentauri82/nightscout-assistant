// @ts-check
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const nightscout = require("./nightscout");
const { dialogflow, SignIn } = require("actions-on-google");
const { i18next, initLocale } = require("./i18n");
const config = functions.config().dialogflow || require("./config");

// Set dialogflow client ID
const app = dialogflow({
  clientId: config.clientid
});

// Initialize localization module
const initializedLocale = initLocale();

// Ensure Firebase is initialized (only once)
if (admin.apps.length === 0) {
  admin.initializeApp();
}

app.intent("Glucose Status", async conv => {
  // Get translation function for this user's locale
  await initializedLocale;
  const t = i18next.getFixedT(conv.user.locale);

  // Does the user have an active account?
  if (conv.user.profile.token === undefined) {
    // No? Ask them to sign in first
    conv.ask(new SignIn(t("signIn.request")));
    return;
  }

  // Get user profile from db
  const userEmail = conv.user.email;
  const userProfile = await nightscout.getUserProfile(userEmail);

  // Get current glucose from Nightscout
  const nightscoutStatus = await nightscout.getNightscoutStatus(
    userProfile,
    userEmail,
    t
  );

  // Should we speak the Health Disclaimer?
  let healthDisclaimer = null;
  if (userProfile && !userProfile.hasHeardHealthDisclaimer) {
    healthDisclaimer = t("signIn.healthDisclaimer");
  }

  // Speak the response and end the conversation
  conv.close(`
      <speak>
        ${nightscoutStatus.response}
        <break time="500ms"/>
        ${healthDisclaimer || ""}
      </speak>
    `);
});

app.intent("Sign In", async (conv, params, signIn) => {
  // Get translation function for this user's locale
  await initializedLocale;
  const t = i18next.getFixedT(conv.user.locale);

  // @ts-ignore
  // Quit if user didn't sign in
  if (signIn.status !== "OK") {
    conv.close();
    return;
  }

  // ASSISTANT SAYS: "Great, your new account is set up. You'll get a confirmation email soon."
  // Get user's profile form db
  const userEmail = conv.user.email;
  const userProfile = await nightscout.getUserProfile(userEmail);

  // Has the user already set up an account?
  if (!userProfile) {
    // No user profile yet, prompt user to visit site and set it up
    // ASSISTANT SAYS: "Before I can get your glucose, you'll need to give me the url to your ns site..."
    conv.close(t("errors.noNsSite"));
  } else {
    // Returning user.
    conv.followup("Glucose Status");
  }
});

exports.glucoseStatus = functions.https.onRequest(app);
