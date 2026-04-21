import { Model } from "./types";

const models = new Map<string, Model<Record<string, unknown>, Record<string, unknown>>>();

export const ModelRegistry = {
    register(name: string, model: Model<Record<string, unknown>, Record<string, unknown>>) {
        models.set(name, model);
    },

    get(name: string) {
        const model = models.get(name);
        if (!model) {
            throw new Error(`Oerem Registry Error: Model [${name}] is not registered.`);
        }
        return model;
    },

    all() {
        return models;
    }
};