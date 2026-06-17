import jwt from "jsonwebtoken";

export const generateToken = (user) => {
  return jwt.sign(
    {
      id: user._id,
      username: user.username,
      roles: user.roles,
    },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
};
