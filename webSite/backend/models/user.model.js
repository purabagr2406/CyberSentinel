import mongoose from 'mongoose'


const userSchema = new mongoose.Schema(
	{
		userName: {
			type: String,
			required: true,
		},
		email: {
			type: String,
			required:true,
			unique: true
		},
		password: {
			type: String,
			required: true,
		},
		userSettings: {
			type: userSettingsSchema,
			default: (()=> ({})),
		},
		userHistory: {
			
		}
	},
	{
		timestamps: true,
	}
);

const userSettingsSchema = new mongoose.Schema({
  participantLimit: {
    type: Number,
    default: 6,
    min: 1,
    max: 12,
  },
  framesPerBatch: {
    type: Number,
    default: 3,
    min: 1,
    max: 6,
  },
  captureIntervalMs: {
    type: Number,
    default: 1000,
    min: 500,
    max: 10000,
  },
  maxQueueSize: {
    type: Number,
    default: 5,
    min: 1,
    max: 20,
  },
  startUpMode: {
    type: String,
    enum: ["auto", "manual"], 
    default: "auto",
  },
});

export const User = mongoose.model("User", userSchema);