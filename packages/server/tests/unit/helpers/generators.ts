
export const TOKEN_ALGORITHM = "HS256";

export const generateTestSecret = () => {
    const randomNumbers = Array.from({length: 64}, () => Math.floor(Math.random() * 256));
    return Uint8Array.from(randomNumbers);
}