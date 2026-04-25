<?php

namespace App\Http\Controllers;

use App\Models\Contact;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ContactController extends Controller
{
    public function index(): JsonResponse
    {
        $contacts = Contact::query()
            ->orderBy('name')
            ->get()
            ->map(fn (Contact $c) => $this->transform($c));

        return response()->json(['data' => $contacts]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name'                 => 'required|string|max:120',
            'color'                => 'nullable|string|max:9',
            'phone_number'         => 'required|string|max:64|unique:contacts,phone_number',
            'iban'                 => 'nullable|string|max:64',
            'whatsapp_profile_pic' => 'nullable|string|max:500',
        ]);

        $contact = Contact::create($data);

        return response()->json(['data' => $this->transform($contact)], 201);
    }

    public function update(Request $request, Contact $contact): JsonResponse
    {
        $data = $request->validate([
            'name'                 => 'sometimes|required|string|max:120',
            'color'                => 'sometimes|nullable|string|max:9',
            'phone_number'         => [
                'sometimes', 'required', 'string', 'max:64',
                Rule::unique('contacts', 'phone_number')->ignore($contact->id),
            ],
            'iban'                 => 'sometimes|nullable|string|max:64',
            'whatsapp_profile_pic' => 'sometimes|nullable|string|max:500',
        ]);

        $contact->update($data);

        return response()->json(['data' => $this->transform($contact->fresh())]);
    }

    public function destroy(Contact $contact): JsonResponse
    {
        $contact->delete();

        return response()->json(['ok' => true]);
    }

    private function transform(Contact $c): array
    {
        return [
            'id'                   => $c->id,
            'name'                 => $c->name,
            'color'                => $c->color,
            'initials'             => $c->initials,
            'phone_number'         => $c->phone_number,
            'country_code'         => $c->country_code,
            'iban'                 => $c->iban,
            'whatsapp_profile_pic' => $c->whatsapp_profile_pic,
            'created_at'           => $c->created_at,
            'updated_at'           => $c->updated_at,
        ];
    }
}
