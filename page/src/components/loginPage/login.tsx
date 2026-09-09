import { useState } from "react";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { userStore } from "../../store/userStore";
import jLogo from "../../assets/j_logo.png";

export const LoginPage = () => {
    const [username, setUsername] = useState("");
    const [gmail, setGmail] = useState("");
    const [isSyncing, setIsSyncing] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!username.trim() || !gmail.trim()) return;

        setIsSyncing(true);
        setErrorMsg(null);

        try {
            console.log("[Login] Syncing user profile via REST API...");
            await userStore.getState().login(username.trim(), gmail.trim());
            console.log("[Login] Sync success. Proceeding to main dashboard.");
            setIsSyncing(false);
        } catch (err: any) {
            console.error("[Login] Error syncing user:", err);
            setErrorMsg(err.message || "Failed to connect and sync user with server.");
            setIsSyncing(false);
        }
    };

    return (
        <div className="relative h-screen w-screen flex items-center justify-center bg-theme-charcoal text-zinc-100 font-sans selection:bg-theme-accent/30 overflow-hidden">
            {/* Ambient background glow */}
            <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-[35rem] h-[35rem] rounded-full bg-theme-accent/10 blur-[120px] pointer-events-none" />
            <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 w-[35rem] h-[35rem] rounded-full bg-theme-plum/5 blur-[120px] pointer-events-none" />

            <div className="w-full max-w-md p-8 rounded-3xl bg-theme-plum/40 border border-zinc-800/50 backdrop-blur-xl shadow-2xl relative z-10">
                <div className="flex flex-col items-center gap-3 mb-8 text-center">
                    <img src={jLogo} alt="Jenix Logo" className="w-16 h-16 object-contain rounded-2xl drop-shadow-md" />
                    <h1 className="text-3xl font-bold tracking-tight bg-linear-to-r from-zinc-100 via-zinc-200 to-zinc-400 bg-clip-text text-transparent font-heading">
                        Jenix
                    </h1>
                    <p className="text-sm text-zinc-400">
                        Create or resume your learning session
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                    {errorMsg && (
                        <div className="p-3.5 text-xs bg-red-950/50 border border-red-800/60 text-red-400 rounded-xl leading-relaxed animate-pulse">
                            {errorMsg}
                        </div>
                    )}

                    <div className="flex flex-col gap-1.5">
                        <label htmlFor="username" className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                            Username / User ID
                        </label>
                        <Input
                            id="username"
                            type="text"
                            placeholder="Enter your username"
                            value={username}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUsername(e.target.value)}
                            required
                            disabled={isSyncing}
                            className="w-full bg-zinc-900/40 border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus-visible:border-theme-accent focus-visible:ring-theme-accent/20"
                        />
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <label htmlFor="gmail" className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                            Gmail Address
                        </label>
                        <Input
                            id="gmail"
                            type="email"
                            placeholder="name@gmail.com"
                            value={gmail}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setGmail(e.target.value)}
                            required
                            disabled={isSyncing}
                            className="w-full bg-zinc-900/40 border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus-visible:border-theme-accent focus-visible:ring-theme-accent/20"
                        />
                    </div>

                    <Button
                        type="submit"
                        isDisabled={isSyncing}
                        className="w-full mt-4 bg-theme-accent text-white hover:bg-theme-hover font-medium py-2.5 rounded-4xl transition-all shadow-lg shadow-theme-accent/10 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                        {isSyncing ? "Connecting & Syncing..." : "Get Started"}
                    </Button>
                </form>
            </div>
        </div>
    );
};