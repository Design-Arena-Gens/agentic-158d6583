import { NextRequest, NextResponse } from "next/server";
import {
  GenerateVideoResponse,
  generateVideoWithGoogle,
  type ReferenceImagePayload,
} from "@/lib/googleGenai";

type RequestPayload = {
  prompt?: string;
  referenceImages?: ReferenceImagePayload[];
};

export async function POST(request: NextRequest) {
  try {
    const body: RequestPayload = await request.json();
    const prompt = (body.prompt ?? "").trim();
    if (!prompt) {
      return NextResponse.json(
        { error: "Prompt is required." },
        { status: 400 },
      );
    }

    const referenceImages = (body.referenceImages ?? []).slice(0, 4);
    if (referenceImages.length === 0) {
      return NextResponse.json(
        { error: "At least one reference image is required." },
        { status: 400 },
      );
    }

    const result: GenerateVideoResponse = await generateVideoWithGoogle({
      prompt,
      referenceImages,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Something went wrong generating the video.",
      },
      { status: 500 },
    );
  }
}

