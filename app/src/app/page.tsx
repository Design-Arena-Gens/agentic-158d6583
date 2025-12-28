'use client';

import Image from 'next/image';
import { useEffect, useMemo, useRef, useState } from 'react';

type ReferenceImageInput = {
  id: number;
  name: string;
  dataUrl?: string;
  file?: File;
  error?: string;
};

type GenerateVideoSuccess = {
  status: 'success';
  operationId: string;
  raw: unknown;
};

type GenerateVideoStub = {
  status: 'stub';
  message: string;
};

type GenerateVideoResponse = GenerateVideoSuccess | GenerateVideoStub;

const MAX_REFERENCE_IMAGES = 2;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function sanitizeFilename(name: string) {
  return name.replace(/\s+/g, '-');
}

function prettyJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export default function Home() {
  const [prompt, setPrompt] = useState('');
  const [images, setImages] = useState<ReferenceImageInput[]>(
    Array.from({ length: MAX_REFERENCE_IMAGES }, (_, index) => ({
      id: index,
      name: `reference-image-${index + 1}`,
    })),
  );
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [stubMessage, setStubMessage] = useState<string | null>(null);
  const [operationId, setOperationId] = useState<string | null>(null);
  const [operationStatus, setOperationStatus] = useState<unknown>(null);
  const [polling, setPolling] = useState(false);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!operationId) {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      return;
    }

    setPolling(true);

    const poll = async () => {
      try {
        const response = await fetch(
          `/api/operations/${encodeURIComponent(operationId)}`,
        );
        if (!response.ok) {
          throw new Error(`Polling failed with ${response.status}`);
        }
        const status = await response.json();
        setOperationStatus(status);
        if (status.done) {
          if (pollTimerRef.current) {
            clearInterval(pollTimerRef.current);
            pollTimerRef.current = null;
          }
          setPolling(false);
        }
      } catch (error) {
        setPolling(false);
        setErrorMessage(
          error instanceof Error ? error.message : 'Failed to poll operation.',
        );
        if (pollTimerRef.current) {
          clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
        }
      }
    };

    void poll();
    pollTimerRef.current = setInterval(poll, 5000);
  }, [operationId]);

  const hasImages = useMemo(
    () => images.some((image) => Boolean(image.dataUrl)),
    [images],
  );

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setErrorMessage(null);
    setStubMessage(null);
    setOperationId(null);
    setOperationStatus(null);

    try {
      if (!prompt.trim()) {
        throw new Error('Prompt is required.');
      }

      const referenceImages = images
        .filter((image) => Boolean(image.dataUrl))
        .map((image) => ({
          name: image.name,
          dataUrl: image.dataUrl as string,
        }));

      if (referenceImages.length === 0) {
        throw new Error('At least one reference image is required.');
      }

      const response = await fetch('/api/generate-video', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt,
          referenceImages,
        }),
      });

      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        const message = detail?.error ?? `Request failed with ${response.status}`;
        throw new Error(message);
      }

      const result: GenerateVideoResponse = await response.json();
      if (result.status === 'stub') {
        setStubMessage(result.message);
      } else {
        setOperationId(result.operationId);
        setOperationStatus(result.raw);
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Something went wrong.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleImageChange(index: number, fileList: FileList | null) {
    if (!fileList || fileList.length === 0) {
      setImages((prev) =>
        prev.map((image, idx) =>
          idx === index
            ? {
                ...image,
                dataUrl: undefined,
                file: undefined,
                error: undefined,
              }
            : image,
        ),
      );
      return;
    }

    const file = fileList[0];
    if (!file.type.startsWith('image/')) {
      setImages((prev) =>
        prev.map((image, idx) =>
          idx === index
            ? {
                ...image,
                error: 'Please choose an image file.',
              }
            : image,
        ),
      );
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      setImages((prev) =>
        prev.map((image, idx) =>
          idx === index
            ? {
                ...image,
                file,
                dataUrl,
                name: sanitizeFilename(file.name),
                error: undefined,
              }
            : image,
        ),
      );
    } catch (error) {
      setImages((prev) =>
        prev.map((image, idx) =>
          idx === index
            ? {
                ...image,
                error:
                  error instanceof Error
                    ? error.message
                    : 'Unable to read the file.',
              }
            : image,
        ),
      );
    }
  }

  function resetImage(index: number) {
    setImages((prev) =>
      prev.map((image, idx) =>
        idx === index
          ? {
              id: image.id,
              name: `reference-image-${index + 1}`,
            }
          : image,
      ),
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-950 to-black text-slate-100">
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-12 px-6 py-16">
        <header className="space-y-4">
          <h1 className="text-3xl font-semibold sm:text-4xl">
            Veo 3.1 Video Generator
          </h1>
          <p className="max-w-3xl text-base text-slate-300 sm:text-lg">
            Provide a rich text prompt and up to two reference images. The app
            will call Google&apos;s Veo 3.1 preview endpoint and poll the
            operation until it completes.
          </p>
        </header>

        <section className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur">
          <form
            onSubmit={handleSubmit}
            className="flex flex-col gap-8 p-8"
            autoComplete="off"
          >
            <div className="flex flex-col gap-3">
              <label
                htmlFor="prompt"
                className="text-sm font-medium uppercase tracking-wide text-slate-200"
              >
                Prompt
              </label>
              <textarea
                id="prompt"
                name="prompt"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="Describe the video you want Veo to generate..."
                className="min-h-[150px] rounded-xl border border-white/10 bg-black/50 p-4 text-base text-slate-100 outline-none ring-offset-0 transition focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400"
              />
            </div>

            <div className="flex flex-col gap-4">
              <span className="text-sm font-medium uppercase tracking-wide text-slate-200">
                Reference Images
              </span>
              <div className="grid gap-6 md:grid-cols-2">
                {images.map((image, index) => (
                  <div
                    key={image.id}
                    className="group relative flex flex-col gap-4 rounded-2xl border border-dashed border-white/15 bg-black/40 p-6 transition hover:border-emerald-400/70"
                  >
                    <div className="flex flex-col gap-2">
                      <label className="text-sm font-semibold text-slate-200">
                        Slot {index + 1}
                      </label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(event) =>
                          handleImageChange(index, event.target.files)
                        }
                        className="block w-full text-sm text-slate-200 file:mr-4 file:rounded-lg file:border-0 file:bg-emerald-500 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-black hover:file:bg-emerald-400"
                      />
                    </div>

                    {image.error && (
                      <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                        {image.error}
                      </p>
                    )}

                    {image.dataUrl ? (
                      <div className="space-y-3">
                        <div className="overflow-hidden rounded-xl border border-white/10">
                          <Image
                            src={image.dataUrl}
                            alt={image.name}
                            width={640}
                            height={360}
                            unoptimized
                            className="h-48 w-full object-cover"
                          />
                        </div>
                        <div className="flex items-center justify-between text-sm text-slate-300">
                          <span className="truncate">{image.name}</span>
                          <button
                            type="button"
                            onClick={() => resetImage(index)}
                            className="rounded-full border border-white/10 px-3 py-1 text-xs uppercase tracking-wide text-slate-200 transition hover:border-red-400 hover:text-red-300"
                          >
                            Clear
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="rounded-xl border border-white/10 bg-black/40 p-4 text-sm text-slate-400">
                        Drop or choose an image that captures the look and feel
                        you&apos;re aiming for.
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {errorMessage && (
              <div className="rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {errorMessage}
              </div>
            )}

            {stubMessage && (
              <div className="rounded-2xl border border-emerald-400/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                {stubMessage}
              </div>
            )}

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <button
                type="submit"
                className="flex h-12 items-center justify-center rounded-full bg-emerald-500 px-8 text-sm font-semibold uppercase tracking-wide text-black transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-500/40 disabled:text-emerald-900/60"
                disabled={submitting || !prompt.trim() || !hasImages}
              >
                {submitting ? 'Submitting…' : 'Generate Video'}
              </button>
              <p className="text-xs uppercase tracking-wide text-slate-400">
                Requires GOOGLE_GENAI_API_KEY server environment variable.
              </p>
            </div>
          </form>
        </section>

        <section className="grid gap-8 md:grid-cols-2">
          <div className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">
                Operation status
              </h2>
              <span className="text-xs uppercase tracking-wide text-slate-400">
                {polling
                  ? 'Polling…'
                  : operationId
                    ? 'Idle'
                    : 'Awaiting request'}
              </span>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/60 p-4">
              {operationId ? (
                <div className="space-y-3">
                  <p className="text-xs uppercase tracking-wide text-emerald-300">
                    Operation: {operationId}
                  </p>
                  <pre className="max-h-[320px] overflow-auto text-xs text-slate-200">
                    {prettyJson(operationStatus ?? {})}
                  </pre>
                </div>
              ) : (
                <p className="text-sm text-slate-300">
                  Submit a prompt and reference images to begin a new video
                  generation operation.
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
            <h2 className="text-lg font-semibold text-white">Usage tips</h2>
            <ul className="list-disc space-y-2 pl-5 text-sm text-slate-300">
              <li>
                Prompts respond best to vivid, cinematic language that sets the
                scene and motion.
              </li>
              <li>
                Reference images help Veo lock onto subjects; use them to define
                the main character or environment.
              </li>
              <li>
                Polling stops automatically once the long-running operation
                reports completion.
              </li>
            </ul>
            <div className="rounded-2xl border border-white/10 bg-black/60 p-4 text-xs text-slate-200">
              <p className="font-semibold text-emerald-300">
                Environment variables
              </p>
              <p>GOOGLE_GENAI_API_KEY=&lt;your-api-key&gt;</p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
