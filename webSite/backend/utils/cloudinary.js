const cloudinary = require('cloudinary').v2;
const fs = require('file-system');


cloudinary.config({
	cloud_name:process.env.CLOUDINARY_CLOUD_NAME,
	api_key:process.env.CLOUDINARY_API_KEY,
	api_secret:process.env.CLOUDINARY_API_SECRET,
});

const uploadOnCloudinary = async (localFilePath) => {
	try {
		if (!localFilePath) return null;

		const response = await cloudinary.uploader.upload(localFilePath,
			{
				resource_type:"auto",
			}
		);
		console.log("File is uploaded to cloudinary: ", response.url);
		return response;
	} catch (error) {
		fs.unlinkSync(localFilePath);
		return null;
	}
};

export {uploadOnCloudinary};