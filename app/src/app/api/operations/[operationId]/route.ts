import { NextRequest, NextResponse } from "next/server";
import { getOperationStatus } from "@/lib/googleGenai";

type Params = {
  operationId: string;
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const { operationId } = await params;
    if (!operationId) {
      return NextResponse.json(
        { error: "operationId is required" },
        { status: 400 },
      );
    }

    const decodedId = decodeURIComponent(operationId);
    const status = await getOperationStatus(decodedId);
    return NextResponse.json(status);
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Something went wrong querying operation status.",
      },
      { status: 500 },
    );
  }
}
