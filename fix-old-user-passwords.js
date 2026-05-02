/**
 * PASSWORD REHASH MIGRATION SCRIPT
 *
 * This script fixes old users who have plaintext or incorrectly hashed passwords
 * Run this ONCE in your Node.js environment (local machine or terminal)
 *
 * HOW TO USE:
 * 1. Make sure you have node_modules installed locally
 * 2. Update MONGO_URI below with your actual MongoDB connection string
 * 3. Update the oldUserPassword variable with the correct password
 * 4. Run: node this-script.js
 */

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

// ⚠️ IMPORTANT: Update these values
const MONGO_URI =
  "mongodb+srv://mikemulla7:admin123@cluster0.zipschv.mongodb.net/examDB?retryWrites=true&w=majority";
const oldUserPassword = "Adebambo+7"; // The password the old user used

// Define User schema (copy of your actual User model)
const userSchema = new mongoose.Schema({
  fullName: String,
  email: String,
  password: String,
  courseId: mongoose.Schema.Types.ObjectId,
  level: Number,
  resetPasswordToken: String,
  resetPasswordExpires: Date,
  createdAt: Date,
  updatedAt: Date,
});

const User = mongoose.model("User", userSchema);

async function fixOldUserPasswords() {
  try {
    console.log("🔗 Connecting to MongoDB...");
    await mongoose.connect(MONGO_URI);
    console.log("✅ Connected to MongoDB\n");

    // Hash the old password with bcryptjs
    console.log("🔐 Hashing old user password...");
    const hashedPassword = await bcrypt.hash(oldUserPassword, 12);
    console.log(`✅ Generated hash: ${hashedPassword}\n`);

    // Find all users
    const allUsers = await User.find();
    console.log(`📋 Found ${allUsers.length} total users in database\n`);

    // Check each user and identify old ones
    let updated = 0;
    let alreadyCorrect = 0;

    for (const user of allUsers) {
      // Check if password is already a proper bcrypt hash
      const isValidBcryptHash =
        user.password &&
        (user.password.startsWith("$2a$") ||
          user.password.startsWith("$2b$") ||
          user.password.startsWith("$2y$"));

      if (isValidBcryptHash) {
        // Verify if the password matches
        try {
          const matches = await bcrypt.compare(oldUserPassword, user.password);
          if (matches) {
            console.log(`✅ ${user.email} - already has correct password hash`);
            alreadyCorrect++;
          } else {
            console.log(`⚠️  ${user.email} - has different password, skipping`);
          }
        } catch (err) {
          console.log(`❌ ${user.email} - hash validation failed, will update`);
          await User.updateOne({ _id: user._id }, { password: hashedPassword });
          updated++;
        }
      } else {
        // Password is not a valid bcrypt hash - update it
        console.log(`🔄 ${user.email} - updating password hash...`);
        await User.updateOne({ _id: user._id }, { password: hashedPassword });
        updated++;
      }
    }

    console.log(`\n📊 Results:`);
    console.log(`   ✅ Updated: ${updated}`);
    console.log(`   ✅ Already correct: ${alreadyCorrect}`);
    console.log(`   📝 Total processed: ${updated + alreadyCorrect}`);

    // Test the hash
    console.log(`\n🧪 Testing hash...`);
    const testMatch = await bcrypt.compare(oldUserPassword, hashedPassword);
    if (testMatch) {
      console.log(`✅ Password verification works! Login should now succeed.`);
    } else {
      console.log(`❌ Password verification failed!`);
    }

    await mongoose.disconnect();
    console.log("\n✅ Migration complete!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

// Run the migration
fixOldUserPasswords();
