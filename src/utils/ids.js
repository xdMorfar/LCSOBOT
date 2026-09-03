import mongoose from 'mongoose';

export function validObjectId(value) {
  return mongoose.isValidObjectId(value);
}
