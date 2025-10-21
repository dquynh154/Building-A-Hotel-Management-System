"use client";

import AppHeader from "@/layout/AppHeader";
import React from "react";

export default function AdminNoSidebarLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-screen">
            <AppHeader leftMode="back" backHref="/admin" />
            <div className="p-4 mx-auto max-w-(--breakpoint-2xl) md:p-6">{children}</div>
        </div>
    );
}

